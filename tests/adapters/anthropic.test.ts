import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { AnthropicAdapter } from '../../src/adapters/anthropic.js';
import type { CanonicalTool, CanonicalMessage } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fixturesDir = resolve(import.meta.dirname, '../fixtures');
const validResponse = JSON.parse(
  readFileSync(resolve(fixturesDir, 'anthropic-response.json'), 'utf-8'),
);
const malformedResponse = JSON.parse(
  readFileSync(resolve(fixturesDir, 'anthropic-response-malformed.json'), 'utf-8'),
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnthropicAdapter', () => {
  const adapter = new AnthropicAdapter();

  describe('providerId', () => {
    it('should be "anthropic"', () => {
      expect(adapter.providerId).toBe('anthropic');
    });
  });

  describe('encodeTools', () => {
    it('should map CanonicalTool to Anthropic tool format with input_schema', () => {
      const tools: CanonicalTool[] = [
        {
          name: 'get_weather',
          description: 'Get current weather for a location',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string', description: 'City name' },
              unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
            },
            required: ['location'],
          },
        },
      ];

      const encoded = adapter.encodeTools(tools);

      expect(encoded).toHaveLength(1);
      expect(encoded[0]).toEqual({
        name: 'get_weather',
        description: 'Get current weather for a location',
        input_schema: tools[0]!.parameters,
      });
    });

    it('should encode multiple tools', () => {
      const tools: CanonicalTool[] = [
        { name: 'tool_a', description: 'First', parameters: { type: 'object' } },
        { name: 'tool_b', description: 'Second', parameters: { type: 'object' } },
      ];

      const encoded = adapter.encodeTools(tools);
      expect(encoded).toHaveLength(2);
    });
  });

  describe('encodeMessages', () => {
    it('should encode a simple user message', () => {
      const messages: CanonicalMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      const encoded = adapter.encodeMessages(messages);

      expect(encoded).toHaveLength(1);
      expect(encoded[0]).toEqual({ role: 'user', content: 'Hello' });
    });

    it('should encode an assistant message with tool calls', () => {
      const messages: CanonicalMessage[] = [
        {
          role: 'assistant',
          content: 'Let me check that.',
          toolCalls: [
            {
              id: 'call_001',
              name: 'get_weather',
              arguments: { location: 'NYC' },
              raw: {},
            },
          ],
        },
      ];

      const encoded = adapter.encodeMessages(messages);

      expect(encoded).toHaveLength(1);
      const content = encoded[0]!.content;
      expect(Array.isArray(content)).toBe(true);
      expect(content).toHaveLength(2); // text + tool_use

      const blocks = content as Array<{ type: string }>;
      expect(blocks[0]!.type).toBe('text');
      expect(blocks[1]!.type).toBe('tool_use');
    });

    it('should encode a tool_result message as a user message', () => {
      const messages: CanonicalMessage[] = [
        {
          role: 'tool_result',
          content: '72°F and sunny',
          toolCallId: 'call_001',
        },
      ];

      const encoded = adapter.encodeMessages(messages);

      expect(encoded).toHaveLength(1);
      expect(encoded[0]!.role).toBe('user');

      const content = encoded[0]!.content;
      expect(Array.isArray(content)).toBe(true);

      const blocks = content as Array<{ type: string; tool_use_id?: string }>;
      expect(blocks[0]!.type).toBe('tool_result');
      expect(blocks[0]!.tool_use_id).toBe('call_001');
    });

    it('should merge adjacent user messages', () => {
      const messages: CanonicalMessage[] = [
        { role: 'user', content: 'First' },
        {
          role: 'tool_result',
          content: 'Result',
          toolCallId: 'call_001',
        },
      ];

      const encoded = adapter.encodeMessages(messages);

      // tool_result becomes a user message, should be merged with the prior user message
      expect(encoded).toHaveLength(1);
      expect(encoded[0]!.role).toBe('user');
    });
  });

  describe('decodeToolCalls', () => {
    it('should decode multiple tool_use blocks from a valid response', () => {
      const toolCalls = adapter.decodeToolCalls(validResponse);

      expect(toolCalls).toHaveLength(2);

      expect(toolCalls[0]!.id).toBe('toolu_01A09q90qw90lq917835lq9');
      expect(toolCalls[0]!.name).toBe('get_weather');
      expect(toolCalls[0]!.arguments).toEqual({
        location: 'San Francisco, CA',
        unit: 'celsius',
      });

      expect(toolCalls[1]!.id).toBe('toolu_02B09q90qw90lq917835lq9');
      expect(toolCalls[1]!.name).toBe('get_forecast');
      expect(toolCalls[1]!.arguments).toEqual({
        location: 'San Francisco, CA',
        days: 5,
      });
    });

    it('should preserve raw payload for debugging', () => {
      const toolCalls = adapter.decodeToolCalls(validResponse);

      expect(toolCalls[0]!.raw).toEqual({
        type: 'tool_use',
        id: 'toolu_01A09q90qw90lq917835lq9',
        name: 'get_weather',
        input: { location: 'San Francisco, CA', unit: 'celsius' },
      });
    });

    it('should decode malformed response arguments as-is (validation is separate)', () => {
      const toolCalls = adapter.decodeToolCalls(malformedResponse);

      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]!.name).toBe('get_weather');
      // Arguments are decoded as-is — validation happens at the canonical layer
      expect(toolCalls[0]!.arguments['location']).toBe(12345);
      expect(toolCalls[0]!.arguments['unit']).toBe('kelvin');
    });

    it('should throw AdapterError for non-Anthropic response format', () => {
      expect(() => adapter.decodeToolCalls({ invalid: true })).toThrow(
        /does not match expected Anthropic format/,
      );
    });

    it('should return empty array when response has no tool_use blocks', () => {
      const textOnlyResponse = {
        content: [{ type: 'text', text: 'Here is your answer.' }],
      };

      const toolCalls = adapter.decodeToolCalls(textOnlyResponse);
      expect(toolCalls).toHaveLength(0);
    });
  });

  describe('decodeTextContent', () => {
    it('should extract text from response', () => {
      const text = adapter.decodeTextContent(validResponse);
      expect(text).toBe("I'll help you check the weather. Let me look that up.");
    });

    it('should return undefined for responses with no text blocks', () => {
      const toolOnlyResponse = {
        content: [
          { type: 'tool_use', id: 'x', name: 'y', input: {} },
        ],
      };

      const text = adapter.decodeTextContent(toolOnlyResponse);
      expect(text).toBeUndefined();
    });
  });
});
