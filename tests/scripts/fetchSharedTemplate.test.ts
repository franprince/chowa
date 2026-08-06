import { describe, it, expect, afterEach } from 'vitest';

import { fetchSharedTemplate, SHARED_TEMPLATE_SHA } from '../../scripts/fetchSharedTemplate.js';

// Plain reassignment rather than a framework mocking helper (`vi.stubGlobal`
// is vitest-only and unavailable under `bun test`, which is what CI
// actually runs) — save and restore the original so other test files in
// the same process aren't affected.
const originalFetch = globalThis.fetch;

describe('fetchSharedTemplate', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches the template from the pinned SHA by default', async () => {
    let calledUrl: string | undefined;
    globalThis.fetch = (async (url: string) => {
      calledUrl = url;
      return new Response('template content', { status: 200 });
    }) as typeof fetch;

    const result = await fetchSharedTemplate();

    expect(result).toBe('template content');
    expect(calledUrl).toBe(
      `https://raw.githubusercontent.com/franprince/chowa-skill/${SHARED_TEMPLATE_SHA}/templates/chowa-workflow.md`,
    );
  });

  it('fetches from an overridden SHA when given one', async () => {
    let calledUrl: string | undefined;
    globalThis.fetch = (async (url: string) => {
      calledUrl = url;
      return new Response('other content', { status: 200 });
    }) as typeof fetch;

    await fetchSharedTemplate({ sha: 'deadbeef' });

    expect(calledUrl).toBe(
      'https://raw.githubusercontent.com/franprince/chowa-skill/deadbeef/templates/chowa-workflow.md',
    );
  });

  it('throws a network-error-labeled message when the fetch itself fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    }) as typeof fetch;

    await expect(fetchSharedTemplate()).rejects.toThrow(/network error/);
  });

  it('throws a distinct message for a non-200 response', async () => {
    globalThis.fetch = (async () =>
      new Response('Not Found', { status: 404, statusText: 'Not Found' })) as typeof fetch;

    await expect(fetchSharedTemplate()).rejects.toThrow(/returned 404/);
  });

  it('does not describe a non-200 response as a network error', async () => {
    globalThis.fetch = (async () => new Response('', { status: 500 })) as typeof fetch;

    await expect(fetchSharedTemplate()).rejects.not.toThrow(/network error/);
  });
});
