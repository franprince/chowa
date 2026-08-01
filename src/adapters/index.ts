/**
 * Adapters barrel export.
 */

export { AnthropicAdapter } from './anthropic.js';
export { OpenAIAdapter } from './openai.js';
export { GeminiAdapter } from './gemini.js';
export { LocalAdapter } from './local.js';
export { getAdapter, registerAdapter, clearAdapterRegistry } from './registry.js';
