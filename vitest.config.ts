import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/cli.ts'],
    },
  },
  resolve: {
    alias: {
      '@chowa/core': new URL('./src/core/index.ts', import.meta.url).pathname,
      '@chowa/adapters': new URL('./src/adapters/index.ts', import.meta.url).pathname,
      '@chowa/router': new URL('./src/router/index.ts', import.meta.url).pathname,
      '@chowa/git': new URL('./src/git/index.ts', import.meta.url).pathname,
      '@chowa/client': new URL('./src/client.ts', import.meta.url).pathname,
    },
  },
});
