#!/usr/bin/env node

/**
 * Chowa CLI
 *
 * Thin CLI entry point. Uses Node's built-in parseArgs (no heavy framework).
 *
 * Commands:
 *   chowa call     — Make a tool-calling LLM request through the normalization layer
 *   chowa route    — Resolve a task profile to a provider/model
 *   chowa commit   — Run diff splitting + commit message generation
 *   chowa pr       — Generate a PR description
 *   chowa antigravity-bridge — Start the Antigravity integration bridge
 */

import { parseArgs } from 'node:util';

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log(`
chowa — LLM coding harness

Usage:
  chowa <command> [options]

Commands:
  call       Make a tool-calling LLM request through the normalization layer
  route      Resolve a task profile to a provider/model
  commit     Split diff into atomic commits with Conventional Commits messages
  pr         Generate a PR description from branch history
  help       Show this help message

Options:
  --provider <id>       Provider ID (anthropic, openai, gemini, local)
  --model <id>          Model identifier
  --kind <type>         Task kind (mechanical, refactor, architecture, security, debug)
  --complexity <level>  Task complexity (low, medium, high)
  --base <branch>       Base branch for PR description (default: main)
  --config <path>       Path to chowa.config.ts (default: ./chowa.config.ts)
  --help                Show this help message

Examples:
  chowa route --kind architecture --complexity high
  chowa commit
  chowa pr --base main
`);
}

async function handleRoute(kind: string, complexity: string): Promise<void> {
  const { resolve } = await import('./router/router.js');

  // Load config (dynamic import to handle .ts config files)
  const policy = await loadPolicy();

  const decision = resolve(
    {
      kind: kind as 'mechanical' | 'refactor' | 'architecture' | 'security' | 'debug',
      estimatedComplexity: complexity as 'low' | 'medium' | 'high',
    },
    policy,
  );

  console.log(JSON.stringify(decision, null, 2));
}

async function handleCheckUpdate(baseBranch?: string): Promise<void> {
  const { GitOps } = await import('./git/gitOps.js');
  const gitOps = new GitOps();

  const status = await gitOps.checkRemoteUpdates('origin', baseBranch);

  if (status.behindCount > 0) {
    console.log(`\n⚠️  Local repository is BEHIND ${status.remoteBranch} by ${status.behindCount} commit(s).`);
    console.log(`   Run 'git pull origin ${baseBranch ?? (await gitOps.getCurrentBranch())}' to pull remote updates.\n`);
  } else {
    console.log(`\n✅ Local repository is up to date with ${status.remoteBranch}.\n`);
  }
}

async function handleCommit(): Promise<void> {
  const { splitDiff } = await import('./git/diffSplitter.js');
  const { GitOps } = await import('./git/gitOps.js');

  const gitOps = new GitOps();
  await handleCheckUpdate();

  const diff = await gitOps.getDiff();

  if (!diff.trim()) {
    console.log('No uncommitted changes detected.');
    return;
  }

  const clusters = splitDiff(diff);
  console.log(`Found ${clusters.length} logical change cluster(s):`);

  for (const cluster of clusters) {
    console.log(`  - ${cluster.id}: ${cluster.files.join(', ')}`);
  }

  // TODO: Generate commit messages and commit each cluster
  console.log('\nCommit message generation requires a configured transport.');
  console.log('Use chowa.config.ts to configure your provider API keys.');
}

async function handlePR(baseBranch: string): Promise<void> {
  const { GitOps } = await import('./git/gitOps.js');

  const gitOps = new GitOps();
  await handleCheckUpdate(baseBranch);

  const currentBranch = await gitOps.getCurrentBranch();

  console.log(`Generating PR description for ${currentBranch} → ${baseBranch}`);

  // TODO: Wire up full PR description generation
  console.log('PR description generation requires a configured transport.');
  console.log('Use chowa.config.ts to configure your provider API keys.');
}

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

async function loadPolicy() {
  const { resolve: routerResolve } = await import('./router/router.js');
  void routerResolve; // suppress unused import warning in stub

  // Default policy — used when no config file is found
  return {
    rules: [
      {
        match: { kind: 'mechanical' as const },
        target: { provider: 'gemini', model: 'gemini-3-flash' },
        priority: 10,
      },
      {
        match: { kind: 'security' as const },
        target: { provider: 'anthropic', model: 'claude-opus-4.6' },
        priority: 100,
      },
      {
        match: { kind: 'architecture' as const, estimatedComplexity: 'high' as const },
        target: { provider: 'anthropic', model: 'claude-opus-4.6' },
        priority: 50,
      },
    ],
    defaultTarget: { provider: 'anthropic', model: 'claude-sonnet-4.6' },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      provider: { type: 'string' },
      model: { type: 'string' },
      kind: { type: 'string', default: 'mechanical' },
      complexity: { type: 'string', default: 'low' },
      base: { type: 'string', default: 'main' },
      config: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  });

  const command = positionals[0];

  if (values.help || !command || command === 'help') {
    printHelp();
    return;
  }

  switch (command) {
    case 'route':
      await handleRoute(values.kind ?? 'mechanical', values.complexity ?? 'low');
      break;

    case 'commit':
      await handleCommit();
      break;

    case 'pr':
      await handlePR(values.base ?? 'main');
      break;

    case 'check-update':
    case 'update-check':
      await handleCheckUpdate(values.base);
      break;

    case 'call':
      console.log('Direct call requires provider, model, and tool configuration.');
      console.log('Use the library API for programmatic access.');
      break;

    case 'antigravity-bridge':
      console.log('Antigravity bridge mode — listening for requests...');
      // TODO: Start the bridge server/stdin listener
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exitCode = 1;
});
