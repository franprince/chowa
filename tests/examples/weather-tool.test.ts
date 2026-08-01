import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

import { AnthropicAdapter } from '../../src/adapters/anthropic.js';
import { validateToolCall } from '../../src/core/validate.js';
import type { CanonicalTool, CanonicalMessage } from '../../src/core/types.js';

/**
 * End-to-end example: get_weather tool
 *
 * Defines a tool once in canonical form (zod schema + CanonicalTool),
 * encodes it for Anthropic, decodes from a fixture response, and validates.
 */

// ---------------------------------------------------------------------------
// Tool definition (the canonical source of truth)
// ---------------------------------------------------------------------------

const weatherSchema = z.object({
  location: z.string().describe('City and state, e.g. "San Francisco, CA"'),
  unit: z.enum(['celsius', 'fahrenheit']).default('celsius').describe('Temperature unit'),
});

const weatherTool: CanonicalTool = {
  name: 'get_weather',
  description: 'Get the current weather for a given location',
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'City and state, e.g. "San Francisco, CA"',
      },
      unit: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
        description: 'Temperature unit',
      },
    },
    required: ['location'],
  },
};

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

describe('Weather Tool E2E', () => {
  const adapter = new AnthropicAdapter();

  it('should encode the canonical tool to Anthropic format', () => {
    const encoded = adapter.encodeTools([weatherTool]);

    expect(encoded).toHaveLength(1);
    expect(encoded[0]!.name).toBe('get_weather');
    expect(encoded[0]!.input_schema).toEqual(weatherTool.parameters);
  });

  it('should encode a user message asking for weather', () => {
    const messages: CanonicalMessage[] = [
      { role: 'user', content: 'What is the weather in San Francisco?' },
    ];

    const encoded = adapter.encodeMessages(messages);

    expect(encoded).toHaveLength(1);
    expect(encoded[0]!.role).toBe('user');
    expect(encoded[0]!.content).toBe('What is the weather in San Francisco?');
  });

  it('should decode a valid tool call and pass validation', () => {
    const toolCalls = adapter.decodeToolCalls(validResponse);
    const weatherCall = toolCalls.find((tc) => tc.name === 'get_weather');

    expect(weatherCall).toBeDefined();
    expect(weatherCall!.arguments['location']).toBe('San Francisco, CA');
    expect(weatherCall!.arguments['unit']).toBe('celsius');

    // Validate against zod schema
    const result = validateToolCall(weatherCall!, weatherSchema);
    expect(result.valid).toBe(true);
  });

  it('should decode a malformed tool call and fail validation with correction message', () => {
    const toolCalls = adapter.decodeToolCalls(malformedResponse);

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]!.name).toBe('get_weather');

    // Validate — should fail because location is a number, unit is "kelvin"
    const result = validateToolCall(toolCalls[0]!, weatherSchema);
    expect(result.valid).toBe(false);

    if (!result.valid) {
      expect(result.error.correctionMessage).toContain('get_weather');
      expect(result.error.correctionMessage).toContain('Please retry');
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should encode a tool result message', () => {
    const messages: CanonicalMessage[] = [
      {
        role: 'tool_result',
        content: JSON.stringify({ temperature: 18, condition: 'Foggy' }),
        toolCallId: 'toolu_01A09q90qw90lq917835lq9',
      },
    ];

    const encoded = adapter.encodeMessages(messages);

    expect(encoded).toHaveLength(1);
    expect(encoded[0]!.role).toBe('user');
    const blocks = encoded[0]!.content as Array<{ type: string; tool_use_id: string }>;
    expect(blocks[0]!.type).toBe('tool_result');
    expect(blocks[0]!.tool_use_id).toBe('toolu_01A09q90qw90lq917835lq9');
  });
});
