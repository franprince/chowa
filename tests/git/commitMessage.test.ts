import { describe, it, expect, vi } from 'vitest';

import { generateCommitMessage, CONVENTIONAL_COMMIT_REGEX } from '../../src/git/commitMessage.js';
import type { DiffCluster } from '../../src/git/types.js';
import type { RoutingPolicy } from '../../src/router/types.js';
import { ChowaClient } from '../../src/client.js';
import type { Transport, TransportResponse } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Mock transport that returns a commit message
// ---------------------------------------------------------------------------

function createMockTransport(responseText: string): Transport {
  return {
    send: vi.fn(async (): Promise<TransportResponse> => ({
      data: {
        content: [{ type: 'text', text: responseText }],
      },
      status: 200,
    })),
  };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const testCluster: DiffCluster = {
  id: 'cluster-0',
  files: ['src/utils/format.ts'],
  hunks: [
    {
      filePath: 'src/utils/format.ts',
      oldStart: 1,
      oldLines: 8,
      newStart: 1,
      newLines: 12,
      content: '-export function formatDate(date: Date): string {\n+export function formatDate(date: Date, pattern: string): string {',
    },
  ],
};

const testPolicy: RoutingPolicy = {
  rules: [
    {
      match: { kind: 'mechanical' },
      target: { provider: 'anthropic', model: 'claude-haiku' },
      priority: 10,
    },
  ],
  defaultTarget: { provider: 'anthropic', model: 'claude-sonnet-4.6' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateCommitMessage', () => {
  it('should return a valid Conventional Commits message', async () => {
    const transport = createMockTransport('refactor(utils): add pattern parameter to formatDate');
    const client = new ChowaClient(transport);

    const message = await generateCommitMessage(testCluster, client, testPolicy);

    expect(CONVENTIONAL_COMMIT_REGEX.test(message)).toBe(true);
    expect(message).toBe('refactor(utils): add pattern parameter to formatDate');
  });

  it('should extract first line when LLM returns multi-line response', async () => {
    const transport = createMockTransport(
      'feat(utils): improve date formatting\n\nThis adds support for custom date patterns.',
    );
    const client = new ChowaClient(transport);

    const message = await generateCommitMessage(testCluster, client, testPolicy);

    expect(CONVENTIONAL_COMMIT_REGEX.test(message)).toBe(true);
  });

  it('should fall back to generic message when LLM response is invalid', async () => {
    const transport = createMockTransport('Updated the formatting utility to be better');
    const client = new ChowaClient(transport);

    const message = await generateCommitMessage(testCluster, client, testPolicy);

    // Should fall back to generic chore message
    expect(CONVENTIONAL_COMMIT_REGEX.test(message)).toBe(true);
    expect(message).toContain('chore:');
  });

  it('should handle empty LLM response gracefully', async () => {
    const transport = createMockTransport('');
    const client = new ChowaClient(transport);

    const message = await generateCommitMessage(testCluster, client, testPolicy);

    expect(CONVENTIONAL_COMMIT_REGEX.test(message)).toBe(true);
  });
});

describe('CONVENTIONAL_COMMIT_REGEX', () => {
  it('should match valid commit messages', () => {
    expect(CONVENTIONAL_COMMIT_REGEX.test('feat: add new feature')).toBe(true);
    expect(CONVENTIONAL_COMMIT_REGEX.test('fix(auth): resolve login bug')).toBe(true);
    expect(CONVENTIONAL_COMMIT_REGEX.test('chore: update deps')).toBe(true);
    expect(CONVENTIONAL_COMMIT_REGEX.test('docs(readme): add examples')).toBe(true);
    expect(CONVENTIONAL_COMMIT_REGEX.test('refactor!: rename API methods')).toBe(true);
    expect(CONVENTIONAL_COMMIT_REGEX.test('perf(db): optimize query')).toBe(true);
  });

  it('should reject invalid commit messages', () => {
    expect(CONVENTIONAL_COMMIT_REGEX.test('updated stuff')).toBe(false);
    expect(CONVENTIONAL_COMMIT_REGEX.test('Feature: something')).toBe(false);
    expect(CONVENTIONAL_COMMIT_REGEX.test('feat:')).toBe(false); // missing description
    expect(CONVENTIONAL_COMMIT_REGEX.test('')).toBe(false);
  });
});
