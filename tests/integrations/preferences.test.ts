import { describe, it, expect } from 'vitest';
import { join } from 'node:path';

import {
  defaultPreferencesPath,
  readPreferences,
  serializePreferences,
  InvalidPreferencesError,
} from '../../src/integrations/preferences.js';

/** Filesystem stub: only the listed path "exists", with the given content. */
const withContent =
  (path: string, content: string) =>
  ({
    exists: (p: string): boolean => p === path,
    readFile: (p: string): string => {
      if (p !== path) throw new Error(`unexpected read of ${p}`);
      return content;
    },
  });

describe('preferences', () => {
  describe('defaultPreferencesPath', () => {
    it('resolves under .chowa in the given home directory', () => {
      expect(defaultPreferencesPath(join('/home', 'x'))).toBe(
        join('/home', 'x', '.chowa', 'preferences.json'),
      );
    });
  });

  describe('readPreferences', () => {
    const path = join('/home', 'x', '.chowa', 'preferences.json');

    it('defaults to alwaysOn: false when the file is missing', () => {
      expect(readPreferences(path, () => false, () => '')).toEqual({ alwaysOn: false });
    });

    it('reads alwaysOn: true from an existing file', () => {
      const stub = withContent(path, '{"alwaysOn":true}');

      expect(readPreferences(path, stub.exists, stub.readFile)).toEqual({ alwaysOn: true });
    });

    it('throws on invalid JSON', () => {
      const stub = withContent(path, 'not json');

      expect(() => readPreferences(path, stub.exists, stub.readFile)).toThrow(
        InvalidPreferencesError,
      );
    });

    it('throws when alwaysOn is missing or the wrong type', () => {
      const stub = withContent(path, '{"alwaysOn":"yes"}');

      expect(() => readPreferences(path, stub.exists, stub.readFile)).toThrow(
        InvalidPreferencesError,
      );
    });
  });

  describe('serializePreferences', () => {
    it('renders pretty JSON with a trailing newline', () => {
      const content = serializePreferences({ alwaysOn: true });

      expect(content).toContain('"alwaysOn": true');
      expect(content.endsWith('\n')).toBe(true);
    });
  });
});
