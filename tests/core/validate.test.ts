import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { validateToolCall, validateToolCalls } from '../../src/core/validate.js';
import type { CanonicalToolCall } from '../../src/core/types.js';

describe('validateToolCall', () => {
  const weatherSchema = z.object({
    location: z.string().describe('City name'),
    unit: z.enum(['celsius', 'fahrenheit']).optional(),
  });

  it('should return valid for correct arguments', () => {
    const call: CanonicalToolCall = {
      id: 'call_001',
      name: 'get_weather',
      arguments: { location: 'San Francisco', unit: 'celsius' },
      raw: {},
    };

    const result = validateToolCall(call, weatherSchema);
    expect(result.valid).toBe(true);
  });

  it('should return valid when optional fields are omitted', () => {
    const call: CanonicalToolCall = {
      id: 'call_002',
      name: 'get_weather',
      arguments: { location: 'NYC' },
      raw: {},
    };

    const result = validateToolCall(call, weatherSchema);
    expect(result.valid).toBe(true);
  });

  it('should return failure with correction message for missing required fields', () => {
    const call: CanonicalToolCall = {
      id: 'call_003',
      name: 'get_weather',
      arguments: { unit: 'celsius' },
      raw: {},
    };

    const result = validateToolCall(call, weatherSchema);
    expect(result.valid).toBe(false);

    if (!result.valid) {
      expect(result.error.toolName).toBe('get_weather');
      expect(result.error.issues.length).toBeGreaterThan(0);
      expect(result.error.correctionMessage).toContain('get_weather');
      expect(result.error.correctionMessage).toContain('Please retry');
    }
  });

  it('should return failure for wrong argument types', () => {
    const call: CanonicalToolCall = {
      id: 'call_004',
      name: 'get_weather',
      arguments: { location: 12345 },
      raw: {},
    };

    const result = validateToolCall(call, weatherSchema);
    expect(result.valid).toBe(false);

    if (!result.valid) {
      expect(result.error.issues[0]!.path).toContain('location');
    }
  });

  it('should return failure for invalid enum values', () => {
    const call: CanonicalToolCall = {
      id: 'call_005',
      name: 'get_weather',
      arguments: { location: 'NYC', unit: 'kelvin' },
      raw: {},
    };

    const result = validateToolCall(call, weatherSchema);
    expect(result.valid).toBe(false);

    if (!result.valid) {
      expect(result.error.correctionMessage).toContain('unit');
    }
  });

  it('should include schema diff in correction message', () => {
    const call: CanonicalToolCall = {
      id: 'call_006',
      name: 'get_weather',
      arguments: {},
      raw: {},
    };

    const result = validateToolCall(call, weatherSchema);
    expect(result.valid).toBe(false);

    if (!result.valid) {
      expect(result.error.correctionMessage).toContain(
        'didn\'t match the expected schema',
      );
      expect(result.error.correctionMessage).toContain('location');
    }
  });
});

describe('validateToolCalls', () => {
  const schemas = new Map<string, z.ZodSchema>([
    [
      'get_weather',
      z.object({ location: z.string() }),
    ],
    [
      'get_forecast',
      z.object({ location: z.string(), days: z.number() }),
    ],
  ]);

  it('should validate multiple tool calls', () => {
    const calls: CanonicalToolCall[] = [
      { id: 'a', name: 'get_weather', arguments: { location: 'NYC' }, raw: {} },
      { id: 'b', name: 'get_forecast', arguments: { location: 'NYC', days: 5 }, raw: {} },
    ];

    const results = validateToolCalls(calls, schemas);

    expect(results.get('a')!.valid).toBe(true);
    expect(results.get('b')!.valid).toBe(true);
  });

  it('should return failure for unrecognized tool names', () => {
    const calls: CanonicalToolCall[] = [
      { id: 'x', name: 'unknown_tool', arguments: {}, raw: {} },
    ];

    const results = validateToolCalls(calls, schemas);
    const result = results.get('x')!;

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.correctionMessage).toContain('not recognized');
      expect(result.error.correctionMessage).toContain('get_weather');
    }
  });

  it('should report partial failures', () => {
    const calls: CanonicalToolCall[] = [
      { id: 'ok', name: 'get_weather', arguments: { location: 'NYC' }, raw: {} },
      { id: 'bad', name: 'get_forecast', arguments: { location: 'NYC' }, raw: {} }, // missing days
    ];

    const results = validateToolCalls(calls, schemas);

    expect(results.get('ok')!.valid).toBe(true);
    expect(results.get('bad')!.valid).toBe(false);
  });
});
