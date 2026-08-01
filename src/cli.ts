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

async function handleRoute(kind: string, complexity: string, configPath?: string): Promise<void> {
  const { resolve } = await import('./router/router.js');
  const { loadPolicy } = await import('./router/loadPolicy.js');

  const policy = await loadPolicy({ configPath });

  const decision = resolve(
    {
      kind: kind as 'mechanical' | 'refactor' | 'architecture' | 'security' | 'debug',
      estimatedComplexity: complexity as 'low' | 'medium' | 'high',
    },
    policy,
  );

  console.log(JSON.stringify(decision, null, 2));
}

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

async function handleSyncGlobal(): Promise<void> {
  const globalConfigDir = join(homedir(), '.gemini', 'config');
  const globalSkillDir = join(globalConfigDir, 'skills', 'chowa');

  try {
    if (!existsSync(globalSkillDir)) {
      mkdirSync(globalSkillDir, { recursive: true });
    }

    const localSkill = join(process.cwd(), '.agents', 'skills', 'chowa', 'SKILL.md');
    if (existsSync(localSkill)) {
      copyFileSync(localSkill, join(globalSkillDir, 'SKILL.md'));
      console.log('✅ Synced chowa skill to ~/.gemini/config/skills/chowa/SKILL.md');
    }

    const globalAgentsFile = join(globalConfigDir, 'AGENTS.md');
    const globalAgentsContent = `# Global Chōwa Workspace Rules

- In any project that has Chōwa installed (as its own source, or as a
  dependency), use the \`chowa\` skill for branching, commit, PR, routing,
  and quality conventions.
- Never push directly to \`main\` or \`master\`. Always work on dedicated
  feature branches and ask the user before creating PRs.
`;
    writeFileSync(globalAgentsFile, globalAgentsContent, 'utf-8');
    console.log('✅ Synced global rules to ~/.gemini/config/AGENTS.md');
  } catch (error) {
    console.error('Failed to sync global rules:', error);
  }
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

async function handleCommit(configPath?: string): Promise<void> {
  const { splitDiff } = await import('./git/diffSplitter.js');
  const { generateCommitMessage } = await import('./git/commitMessage.js');
  const { GitOps } = await import('./git/gitOps.js');
  const { ChowaClient } = await import('./client.js');
  const { loadPolicy } = await import('./router/loadPolicy.js');

  const gitOps = new GitOps();
  await handleCheckUpdate();

  const diff = (await gitOps.getDiff()) || (await gitOps.getStagedDiff());

  if (!diff.trim()) {
    console.log('No uncommitted changes detected.');
    return;
  }

  const clusters = splitDiff(diff);
  console.log(`Found ${clusters.length} logical change cluster(s):\n`);

  const client = new ChowaClient();
  const policy = await loadPolicy({ configPath });

  for (const cluster of clusters) {
    console.log(`📦 Cluster ${cluster.id} [${cluster.files.join(', ')}]:`);
    const message = await generateCommitMessage(cluster, client, policy);
    console.log(`   Suggested commit: "${message}"\n`);
  }
}

async function handlePR(baseBranch: string, configPath?: string): Promise<void> {
  const { GitOps } = await import('./git/gitOps.js');
  const { generatePRDescription } = await import('./git/prDescription.js');
  const { ChowaClient } = await import('./client.js');
  const { loadPolicy } = await import('./router/loadPolicy.js');

  const gitOps = new GitOps();
  await handleCheckUpdate(baseBranch);

  const currentBranch = await gitOps.getCurrentBranch();
  console.log(`Generating PR description for ${currentBranch} → ${baseBranch}...\n`);

  const commits = await gitOps.getCommitHistory(baseBranch);
  const diff = await gitOps.getDiffAgainstBase(baseBranch);

  const client = new ChowaClient();
  const policy = await loadPolicy({ configPath });

  const pr = await generatePRDescription(commits, diff, client, policy, currentBranch);

  console.log(`# PR Description: ${currentBranch} → ${baseBranch}\n`);
  console.log(`## Summary\n${pr.summary}\n`);
  console.log(`## Changes\n${pr.changes.map((c) => `- ${c}`).join('\n')}\n`);
  console.log(`## Testing Notes\n${pr.testing}\n`);
  if (pr.breakingChanges) {
    console.log(`## ⚠️ Breaking Changes\n${pr.breakingChanges}\n`);
  }
  if (pr.type === 'feature' && pr.rolloutNotes) {
    console.log(`## Rollout Notes\n${pr.rolloutNotes}\n`);
  }
  if (pr.type === 'release' && pr.rolloutPlan) {
    console.log(`## Rollout / Rollback Plan\n${pr.rolloutPlan}\n`);
  }
}

async function handleAntigravityBridge(configPath?: string): Promise<void> {
  const { AntigravityBridge } = await import('./integrations/antigravity/bridge.js');
  const { ChowaClient } = await import('./client.js');
  const { loadPolicy } = await import('./router/loadPolicy.js');

  const client = new ChowaClient();
  const policy = await loadPolicy({ configPath });
  const bridge = new AntigravityBridge(client, policy);

  let input = '';
  process.stdin.setEncoding('utf-8');

  for await (const chunk of process.stdin) {
    input += chunk;
  }

  if (!input.trim()) {
    console.log(JSON.stringify({
      success: false,
      action: 'bridge',
      error: 'Empty request input provided on stdin',
    }));
    return;
  }

  try {
    const request = JSON.parse(input.trim());
    const response = await bridge.handle(request);
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      success: false,
      action: 'bridge',
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

async function handleModels(provider?: string): Promise<void> {
  const { ChowaClient } = await import('./client.js');
  const client = new ChowaClient();
  const models = client.getAvailableModels(provider);

  console.log(JSON.stringify(models, null, 2));
}

async function handleClaudeCodeBridge(configPath?: string): Promise<void> {
  const { ClaudeCodeBridge } = await import('./integrations/claude-code/bridge.js');
  const { ChowaClient } = await import('./client.js');
  const { loadPolicy } = await import('./router/loadPolicy.js');

  const client = new ChowaClient();
  const policy = await loadPolicy({ configPath });
  const bridge = new ClaudeCodeBridge(client, policy);

  let input = '';
  process.stdin.setEncoding('utf-8');

  for await (const chunk of process.stdin) {
    input += chunk;
  }

  if (!input.trim()) {
    console.log(JSON.stringify({
      success: false,
      action: 'bridge',
      error: 'Empty request input provided on stdin',
    }));
    return;
  }

  try {
    const request = JSON.parse(input.trim());
    const response = await bridge.handle(request);
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      success: false,
      action: 'bridge',
      error: error instanceof Error ? error.message : String(error),
    }));
  }
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
      await handleRoute(values.kind ?? 'mechanical', values.complexity ?? 'low', values.config);
      break;

    case 'models':
      await handleModels(values.provider);
      break;

    case 'commit':
      await handleCommit(values.config);
      break;

    case 'pr':
      await handlePR(values.base ?? 'main', values.config);
      break;

    case 'check-update':
    case 'update-check':
      await handleCheckUpdate(values.base);
      break;

    case 'sync-global':
      await handleSyncGlobal();
      break;

    case 'call':
      console.log('Direct call requires provider, model, and tool configuration.');
      console.log('Use the library API for programmatic access.');
      break;

    case 'antigravity-bridge':
      await handleAntigravityBridge(values.config);
      break;

    case 'claude-code-bridge':
      await handleClaudeCodeBridge(values.config);
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

