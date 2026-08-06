/**
 * Fetches the shared workflow template from `franprince/chowa-skill`,
 * pinned to an exact commit SHA (not a branch) so CI stays deterministic —
 * an unrelated commit landing in that repo mid-PR here can't flip this
 * repo's `check:skill` result.
 *
 * To bump the pin: find the `chowa-skill` commit that changed
 * `templates/chowa-workflow.md`, update SHARED_TEMPLATE_SHA below, run
 * `bun run sync:skill`, review the regenerated diff, and commit the pin
 * bump together with the regenerated files — never separately, since a
 * committed pin with stale generated output is itself a drift state.
 */

const REPO = 'franprince/chowa-skill';
const TEMPLATE_PATH = 'templates/chowa-workflow.md';

export const SHARED_TEMPLATE_SHA = '9884dd450190e9a1d65c042e9b538c6ba45cf3e6';

export interface FetchTemplateOptions {
  readonly sha?: string;
  readonly timeoutMs?: number;
}

/**
 * Fetches the raw template at the pinned (or overridden) commit. Throws a
 * clearly labeled error distinguishing a network/fetch failure from an
 * unexpected response (e.g. a 404 if the pin or path is wrong) — the two
 * need different fixes (retry vs. fix the pin) and must not be reported
 * the same way.
 */
export async function fetchSharedTemplate(options?: FetchTemplateOptions): Promise<string> {
  const sha = options?.sha ?? SHARED_TEMPLATE_SHA;
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const url = `https://raw.githubusercontent.com/${REPO}/${sha}/${TEMPLATE_PATH}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    throw new Error(
      `Failed to fetch the shared workflow template (network error) from ${url}: ` +
        `${error instanceof Error ? error.message : String(error)}. ` +
        `This is a connectivity issue, not drifted content — check network access and retry.`,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch the shared workflow template: ${url} returned ` +
        `${response.status} ${response.statusText}. This usually means SHARED_TEMPLATE_SHA ` +
        `in scripts/fetchSharedTemplate.ts points at a commit or path that no longer exists — ` +
        `not that the fetched content drifted.`,
    );
  }

  return response.text();
}
