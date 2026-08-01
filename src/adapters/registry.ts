/**
 * Adapter Registry
 *
 * Central lookup for provider adapters. Application code uses
 * `getAdapter(providerId)` instead of importing adapter classes directly,
 * keeping the provider selection decoupled from usage.
 */

import type { ProviderAdapter } from '../core/types.js';
import { AnthropicAdapter } from './anthropic.js';
import { OpenAIAdapter } from './openai.js';
import { GeminiAdapter } from './gemini.js';
import { LocalAdapter } from './local.js';

const builtInAdapters: Record<string, () => ProviderAdapter> = {
  anthropic: () => new AnthropicAdapter(),
  openai: () => new OpenAIAdapter(),
  gemini: () => new GeminiAdapter(),
  local: () => new LocalAdapter(),
};

const adapterCache = new Map<string, ProviderAdapter>();
const customAdapters = new Map<string, () => ProviderAdapter>();

/**
 * Get a provider adapter by its ID.
 *
 * @throws Error if no adapter is registered for the given provider ID.
 */
export function getAdapter(providerId: string): ProviderAdapter {
  const cached = adapterCache.get(providerId);
  if (cached) {
    return cached;
  }

  const factory = customAdapters.get(providerId) ?? builtInAdapters[providerId];
  if (!factory) {
    const available = [
      ...Object.keys(builtInAdapters),
      ...customAdapters.keys(),
    ].join(', ');
    throw new Error(
      `No adapter registered for provider "${providerId}". Available: ${available}`,
    );
  }

  const adapter = factory();
  adapterCache.set(providerId, adapter);
  return adapter;
}

/**
 * Register a custom adapter (or override a built-in one).
 * Useful for testing or adding new providers at runtime.
 */
export function registerAdapter(
  providerId: string,
  factory: () => ProviderAdapter,
): void {
  customAdapters.set(providerId, factory);
  adapterCache.delete(providerId); // clear cache so next get() uses new factory
}

/**
 * Clear all cached adapter instances and custom registrations.
 * Primarily useful for test isolation.
 */
export function clearAdapterRegistry(): void {
  adapterCache.clear();
  customAdapters.clear();
}
