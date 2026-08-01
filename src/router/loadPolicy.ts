/**
 * Routing Policy Loader
 *
 * Loads a RoutingPolicy from a `chowa.config.ts` file (dynamic ESM import),
 * falling back to a built-in default policy when no config file exists at
 * the default location. An explicitly-requested `--config` path that is
 * missing, or a config file that fails to load or doesn't match the
 * expected shape, is treated as an error rather than silently substituting
 * the default — a config a human just edited should fail loudly, not
 * pretend nothing happened.
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

export interface LoadPolicyOptions {
  /** Path to the config file, relative to `cwd` unless absolute. Defaults to "chowa.config.ts". */
  readonly configPath?: string;
  /** Working directory to resolve `configPath` against. Defaults to `process.cwd()`. */
  readonly cwd?: string;
}

/**
 * Resolve a RoutingPolicy from `chowa.config.ts` (or the given `--config`
 * path). Falls back to `DEFAULT_POLICY` only when no path was explicitly
 * requested and nothing exists at the default location.
 */
export async function loadPolicy(options: LoadPolicyOptions = {}): Promise<RoutingPolicy> {
  const cwd = options.cwd ?? process.cwd();
  const explicitPath = options.configPath;
  const resolvedPath = resolvePath(cwd, explicitPath ?? 'chowa.config.ts');

  if (!existsSync(resolvedPath)) {
    if (explicitPath) {
      throw new Error(`Config file not found at "${resolvedPath}" (from --config)`);
    }
    return DEFAULT_POLICY;
  }

  let mod: { default?: unknown };
  try {
    mod = (await import(pathToFileURL(resolvedPath).href)) as { default?: unknown };
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load config file at "${resolvedPath}": ${cause}`);
  }

  const config = mod.default;
  assertChowaConfig(config, resolvedPath);

  return config.routing as RoutingPolicy;
}

function assertChowaConfig(config: unknown, path: string): asserts config is ChowaConfig {
  if (!config || typeof config !== 'object' || !('routing' in config)) {
    throw new Error(
      `Invalid chowa.config.ts at "${path}": expected a default export with a "routing" key.`,
    );
  }

  const routing = (config as ChowaConfig).routing;
  if (!routing || !Array.isArray(routing.rules) || !routing.defaultTarget) {
    throw new Error(
      `Invalid chowa.config.ts at "${path}": "routing" must have a "rules" array and a "defaultTarget".`,
    );
  }
}
