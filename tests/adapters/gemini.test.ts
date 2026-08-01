import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

import { GeminiAdapter } from '../../src/adapters/gemini.js';
import type { CanonicalTool, CanonicalMessage } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fixturesDir = resolve(import.meta.dirname, '../fixtures');
const validResponse = JSON.parse(
  readFileSync(resolve(fixturesDir, 'gemini-response.json'), 'utf-8'),
);
const malformedResponse = JSON.parse(
  readFileSync(resolve(fixturesDir, 'gemini-response-malformed.json'), 'utf-8'),
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GeminiAdapter', () => {
  const adapter = new GeminiAdapter();

  describe('providerId', () => {
    it('should be "gemini"', () => {
      expect(adapter.providerId).toBe('gemini');
    });
  });

  describe('encodeTools', () => {
    it('should map CanonicalTool to Gemini tool format with functionDeclarations', () => {
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

      const encoded = adapter.encodeTools(tools) as {
        functionDeclarations: Array<{
          name: string;
          description: string;
          parameters: unknown;
        }>;
      };

      expect(encoded.functionDeclarations).toHaveLength(1);
      expect(encoded.functionDeclarations[0]).toEqual({
        name: 'get_weather',
        description: 'Get current weather for a location',
        parameters: tools[0]!.parameters,
      });
    });

    it('should encode multiple tools', () => {
      const tools: CanonicalTool[] = [
        { name: 'tool_a', description: 'First', parameters: { type: 'object' } },
        { name: 'tool_b', description: 'Second', parameters: { type: 'object' } },
      ];

      const encoded = adapter.encodeTools(tools) as {
        functionDeclarations: unknown[];
      };
      expect(encoded.functionDeclarations).toHaveLength(2);
    });
  });

  describe('encodeMessages', () => {
    it('should encode a simple user message', () => {
      const messages: CanonicalMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      const encoded = adapter.encodeMessages(messages);

      expect(encoded).toHaveLength(1);
      expect(encoded[0]).toEqual({
        role: 'user',
        parts: [{ text: 'Hello' }],
      });
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
      expect(encoded[0]!.role).toBe('model');
      expect(encoded[0]!.parts).toHaveLength(2); // text + functionCall
      expect(encoded[0]!.parts[0]).toEqual({ text: 'Let me check that.' });
      expect(encoded[0]!.parts[1]).toEqual({
        functionCall: {
          name: 'get_weather',
          args: { location: 'NYC' },
        },
      });
    });

    it('should encode a tool_result message with functionResponse matching previous toolCallId', () => {
      const messages: CanonicalMessage[] = [
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'call_001',
              name: 'get_weather',
              arguments: { location: 'NYC' },
              raw: {},
            },
          ],
        },
        {
          role: 'tool_result',
          content: '72°F and sunny',
          toolCallId: 'call_001',
        },
      ];

      const encoded = adapter.encodeMessages(messages);

      expect(encoded).toHaveLength(2);
      expect(encoded[1]!.role).toBe('user');
      expect(encoded[1]!.parts[0]).toEqual({
        functionResponse: {
          name: 'get_weather',
          response: { output: '72°F and sunny' },
        },
      });
    });

    it('should merge adjacent user messages', () => {
      const messages: CanonicalMessage[] = [
        { role: 'user', content: 'First prompt' },
        {
          role: 'tool_result',
          content: 'Result content',
          toolCallId: 'call_001',
        },
      ];

      const encoded = adapter.encodeMessages(messages);

      // tool_result becomes a user message, should be merged with the prior user message
      expect(encoded).toHaveLength(1);
      expect(encoded[0]!.role).toBe('user');
      expect(encoded[0]!.parts).toHaveLength(2);
    });
  });

  describe('decodeToolCalls', () => {
    it('should decode multiple function calls from a valid Gemini response', () => {
      const toolCalls = adapter.decodeToolCalls(validResponse);

      expect(toolCalls).toHaveLength(2);

      const expectedId0 = createHash('sha256')
        .update('get_weather:0:0')
        .digest('hex')
        .slice(0, 24);
      expect(toolCalls[0]!.id).toBe(expectedId0);
      expect(toolCalls[0]!.name).toBe('get_weather');
      expect(toolCalls[0]!.arguments).toEqual({
        location: 'San Francisco, CA',
        unit: 'celsius',
      });

      const expectedId1 = createHash('sha256')
        .update('get_forecast:0:1')
        .digest('hex')
        .slice(0, 24);
      expect(toolCalls[1]!.id).toBe(expectedId1);
      expect(toolCalls[1]!.name).toBe('get_forecast');
      expect(toolCalls[1]!.arguments).toEqual({
        location: 'San Francisco, CA',
        days: 5,
      });
    });

    it('should respect turnIndex when synthesizing deterministic IDs', () => {
      const toolCalls = adapter.decodeToolCalls(validResponse, 3);
      const expectedId = createHash('sha256')
        .update('get_weather:3:0')
        .digest('hex')
        .slice(0, 24);
      expect(toolCalls[0]!.id).toBe(expectedId);
    });

    it('should preserve raw payload for debugging', () => {
      const toolCalls = adapter.decodeToolCalls(validResponse);

      expect(toolCalls[0]!.raw).toEqual({
        functionCall: {
          name: 'get_weather',
          args: { location: 'San Francisco, CA', unit: 'celsius' },
        },
      });
    });

    it('should decode malformed response arguments as-is (validation is separate)', () => {
      const toolCalls = adapter.decodeToolCalls(malformedResponse);

      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]!.name).toBe('get_weather');
      expect(toolCalls[0]!.arguments['location']).toBe(12345);
      expect(toolCalls[0]!.arguments['unit']).toBe('kelvin');
    });

    it('should throw AdapterError for non-Gemini response format', () => {
      expect(() => adapter.decodeToolCalls({ invalid: true })).toThrow(
        /does not match expected Gemini format/,
      );
    });

    it('should return empty array when response has no functionCall parts', () => {
      const textOnlyResponse = {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'Here is your answer.' }],
            },
          },
        ],
      };

      const toolCalls = adapter.decodeToolCalls(textOnlyResponse);
      expect(toolCalls).toHaveLength(0);
    });
  });

  describe('decodeTextContent', () => {
    it('should extract text from response', () => {
      const text = adapter.decodeTextContent(validResponse);
      expect(text).toBe("I'll help you check the weather and forecast.");
    });

    it('should return undefined for responses with no text blocks', () => {
      const toolOnlyResponse = {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                { functionCall: { name: 'y', args: {} } },
              ],
            },
          },
        ],
      };

      const text = adapter.decodeTextContent(toolOnlyResponse);
      expect(text).toBeUndefined();
    });
  });
});
