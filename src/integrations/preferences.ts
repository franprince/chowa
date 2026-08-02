/**
 * Personal always-on preference
 *
 * Backs `chowa always-on [on|off]`: a per-user, per-machine preference,
 * independent of any project and of harness, that Step 0 of the skill
 * checks ahead of the per-project opt-in signals. Stored at
 * `~/.chowa/preferences.json`.
 *
 * Parsing/path logic is pure and DI-friendly, matching the rest of
 * `integrations/`; the actual `writeFileSync`/`mkdirSync` calls live in
 * `cli.ts`'s handler, same as `handleInstall` does its own writes rather
 * than `install.ts` doing them internally.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ChowaPreferences {
  readonly alwaysOn: boolean;
}

const DEFAULT_PREFERENCES: ChowaPreferences = { alwaysOn: false };

export const PREFERENCES_RELATIVE = join('.chowa', 'preferences.json');

export function defaultPreferencesPath(homeDir: string): string {
  return join(homeDir, PREFERENCES_RELATIVE);
}

/**
 * Thrown when the preferences file exists but is corrupted or hand-edited
 * into an invalid shape — surfaced immediately rather than silently
 * defaulting to off, so a broken file doesn't quietly disable something the
 * user turned on.
 */
export class InvalidPreferencesError extends Error {
  constructor(path: string, reason: string) {
    super(`Chōwa preferences file at "${path}" ${reason}`);
    this.name = 'InvalidPreferencesError';
  }
}

export function parsePreferences(raw: string, path: string): ChowaPreferences {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidPreferencesError(path, 'is not valid JSON.');
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as Record<string, unknown>).alwaysOn !== 'boolean'
  ) {
    throw new InvalidPreferencesError(
      path,
      'must be a JSON object with a boolean "alwaysOn" field.',
    );
  }

  return { alwaysOn: (parsed as ChowaPreferences).alwaysOn };
}

export function readPreferences(
  path: string,
  exists: (p: string) => boolean = existsSync,
  readFile: (p: string, encoding: 'utf-8') => string = (p, encoding) => readFileSync(p, encoding),
): ChowaPreferences {
  if (!exists(path)) {
    return DEFAULT_PREFERENCES;
  }
  return parsePreferences(readFile(path, 'utf-8'), path);
}

export function serializePreferences(prefs: ChowaPreferences): string {
  return `${JSON.stringify(prefs, null, 2)}\n`;
}
