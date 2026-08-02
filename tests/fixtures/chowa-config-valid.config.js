/**
 * Plain-JavaScript equivalent of `chowa-config-valid.config.ts`.
 *
 * Exists to prove the loader's `.js` path works without TypeScript type
 * stripping — the whole point of probing more than one extension.
 */

const config = {
  routing: {
    rules: [
      {
        match: { kind: 'debug' },
        target: {
          provider: 'openai',
          model: 'gpt-from-js-config',
        },
        priority: 20,
      },
    ],
    defaultTarget: { provider: 'local', model: 'llama-from-js-config' },
  },
};

export default config;
