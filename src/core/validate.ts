/**
 * Tool Call Validation
 *
 * Validates decoded CanonicalToolCall arguments against a zod schema.
 * On failure, returns a structured ValidationError with a pre-formatted
 * correction message suitable for sending back to the LLM as a retry prompt.
 *
 * This module lives at the canonical layer — it is never duplicated per-adapter.
 */

import type { ZodSchema, ZodError, ZodIssue } from 'zod';

import type { CanonicalToolCall } from './types.js';
import { ValidationError } from './errors.js';
import type { ValidationIssue } from './errors.js';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ValidationSuccess {
  readonly valid: true;
}

export interface ValidationFailure {
  readonly valid: false;
  readonly error: ValidationError;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

// ---------------------------------------------------------------------------
// Core validation function
// ---------------------------------------------------------------------------

/**
 * Validate a tool call's arguments against the tool's zod schema.
 *
 * @returns `{ valid: true }` on success, or `{ valid: false, error }` with
 *          a `ValidationError` containing a correction message ready to
 *          send back to the LLM.
 */
export function validateToolCall(
  call: CanonicalToolCall,
  schema: ZodSchema,
): ValidationResult {
  const result = schema.safeParse(call.arguments);

  if (result.success) {
    return { valid: true };
  }

  const issues = mapZodIssues(result.error);
  const correctionMessage = buildCorrectionMessage(call.name, result.error);

  return {
    valid: false,
    error: new ValidationError(call.name, issues, correctionMessage),
  };
}

// ---------------------------------------------------------------------------
// Batch validation
// ---------------------------------------------------------------------------

/**
 * Validate multiple tool calls, returning results keyed by tool call ID.
 * Useful when an assistant turn contains multiple tool calls.
 */
export function validateToolCalls(
  calls: readonly CanonicalToolCall[],
  schemas: ReadonlyMap<string, ZodSchema>,
): Map<string, ValidationResult> {
  const results = new Map<string, ValidationResult>();

  for (const call of calls) {
    const schema = schemas.get(call.name);
    if (!schema) {
      results.set(call.id, {
        valid: false,
        error: new ValidationError(
          call.name,
          [{ path: [], message: `No schema registered for tool "${call.name}"` }],
          `Tool "${call.name}" is not recognized. Available tools: ${[...schemas.keys()].join(', ')}`,
        ),
      });
      continue;
    }

    results.set(call.id, validateToolCall(call, schema));
  }

  return results;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function mapZodIssues(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue: ZodIssue) => ({
    path: issue.path,
    message: issue.message,
    expected: 'expected' in issue ? String(issue.expected) : undefined,
    received: 'received' in issue ? String(issue.received) : undefined,
  }));
}

function buildCorrectionMessage(toolName: string, error: ZodError): string {
  const issueLines = error.issues.map((issue: ZodIssue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `  - ${path}: ${issue.message}`;
  });

  return [
    `Your last tool call to "${toolName}" didn't match the expected schema:`,
    ...issueLines,
    '',
    'Please retry with corrected arguments.',
  ].join('\n');
}
