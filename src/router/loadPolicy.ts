/**
 * Routing Policy Loader
 *
 * Loads a RoutingPolicy from a `chowa.config.{ts,js,mjs}` file (dynamic ESM
 * import), falling back to a built-in default policy when no config file
 * exists at the default location. An explicitly-requested `--config` path
 * that is missing, or a config file that fails to load or doesn't match the
 * expected shape, is treated as an error rather than silently substituting
 * the default — a config a human just edited should fail loudly, not
 * pretend nothing happened.
 *
 * The `.js`/`.mjs` candidates exist because importing a `.ts` file at
 * runtime requires TypeScript type stripping, which is only unflagged in
 * Node >= 22.18 and >= 23.6. Bun strips types natively, which is why the
 * `.ts`-only loader worked for as long as Chōwa was only ever run through
 * Bun from a source checkout. A plain-JavaScript config needs no such
 * support and therefore loads on every runtime Chōwa targets.
 */

import { existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ChowaConfig } from '../core/types.js';
import type { RoutingPolicy } from './types.js';

// ---------------------------------------------------------------------------
// Built-in default policy (used when no config file is found)
// ---------------------------------------------------------------------------

export const DEFAULT_POLICY: RoutingPolicy = {
  rules: [
    {
      match: { kind: 'mechanical' },
      target: { provider: 'gemini', model: 'gemini-3.6-flash' },
      priority: 10,
    },
    {
      match: { kind: 'security' },
      target: { provider: 'anthropic', model: 'claude-opus-4.6' },
      priority: 100,
    },
    {
      match: { kind: 'architecture', estimatedComplexity: 'high' },
      target: { provider: 'anthropic', model: 'claude-opus-4.6' },
      priority: 50,
    },
  ],
  defaultTarget: { provider: 'anthropic', model: 'claude-sonnet-4.6' },
};

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Config filenames probed, in order, when no explicit `--config` is given.
 * `.ts` stays first: it's the documented default and the one type-checked
 * by `tsconfig.lint.json`.
 */
export const CONFIG_CANDIDATES = [
  'chowa.config.ts',
  'chowa.config.js',
  'chowa.config.mjs',
] as const;

export interface LoadPolicyOptions {
  /** Path to the config file, relative to `cwd` unless absolute. Defaults to probing `CONFIG_CANDIDATES`. */
  readonly configPath?: string;
  /** Working directory to resolve `configPath` against. Defaults to `process.cwd()`. */
  readonly cwd?: string;
}

/**
 * Find the config file Chōwa would load from `cwd` when no `--config` was
 * given, or `undefined` if there isn't one. Exported so callers can report
 * which file actually won when a project has more than one candidate.
 */
export function findConfigPath(cwd: string = process.cwd()): string | undefined {
  for (const candidate of CONFIG_CANDIDATES) {
    const path = resolvePath(cwd, candidate);
    if (existsSync(path)) {
      return path;
    }
  }
  return undefined;
}

/**
 * Resolve a RoutingPolicy from `chowa.config.{ts,js,mjs}` (or the given
 * `--config` path). Falls back to `DEFAULT_POLICY` only when no path was
 * explicitly requested and no candidate exists.
 */
export async function loadPolicy(options: LoadPolicyOptions = {}): Promise<RoutingPolicy> {
  const cwd = options.cwd ?? process.cwd();
  const explicitPath = options.configPath;

  let resolvedPath: string;
  if (explicitPath) {
    resolvedPath = resolvePath(cwd, explicitPath);
    if (!existsSync(resolvedPath)) {
      throw new Error(`Config file not found at "${resolvedPath}" (from --config)`);
    }
  } else {
    const found = findConfigPath(cwd);
    if (!found) {
      return DEFAULT_POLICY;
    }
    resolvedPath = found;
  }

  let mod: { default?: unknown };
  try {
    mod = (await import(pathToFileURL(resolvedPath).href)) as { default?: unknown };
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(describeImportFailure(cause, resolvedPath));
  }

  const config = mod.default;
  assertChowaConfig(config, resolvedPath);

  return config.routing as RoutingPolicy;
}

/**
 * Turn a dynamic-import failure into something the reader can act on.
 *
 * The case worth special-casing is a runtime that can't import TypeScript:
 * the bare cause is `Unknown file extension ".ts"`, which says nothing
 * about what to do next. Every other failure keeps its original message.
 *
 * Exported for testing — reproducing a runtime without type stripping from
 * inside the test process isn't possible, so the mapping is verified
 * directly against a synthetic cause.
 */
export function describeImportFailure(cause: string, path: string): string {
  if (/Unknown file extension "\.ts"/.test(cause)) {
    return (
      `Failed to load config file at "${path}": this runtime cannot import ` +
      `TypeScript directly. Either run Chōwa on Node >= 22.18 (or Bun), or ` +
      `rename the config to chowa.config.js.`
    );
  }
  return `Failed to load config file at "${path}": ${cause}`;
}

function assertChowaConfig(config: unknown, path: string): asserts config is ChowaConfig {
  if (!config || typeof config !== 'object' || !('routing' in config)) {
    throw new Error(
      `Invalid Chōwa config at "${path}": expected a default export with a "routing" key.`,
    );
  }

  const routing = (config as ChowaConfig).routing;
  if (!routing || !Array.isArray(routing.rules) || !routing.defaultTarget) {
    throw new Error(
      `Invalid Chōwa config at "${path}": "routing" must have a "rules" array and a "defaultTarget".`,
    );
  }
}
