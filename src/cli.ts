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
  init       Scaffold a chowa.config.js for this project
  always-on  Apply (or stop applying) Chōwa's workflow to every project [on|off]
  install    Install the chowa skill for a harness with no plugin system
  abandon    Stop tracking the current branch's session for auto-resume
  ledger     Session auto-resume ledger: status | sweep | install
  help       Show this help message

Options:
  --provider <id>       Provider ID (anthropic, openai, gemini, local)
  --model <id>          Model identifier
  --kind <type>         Task kind (mechanical, refactor, architecture, security, debug)
  --complexity <level>  Task complexity (low, medium, high)
  --base <branch>       Base branch for PR description (default: main)
  --config <path>       Path to chowa.config.{ts,js,mjs} (default: probed in cwd)
  --agent <harness>     Target harness for "install" (gemini)
  --reason <text>       Reason for "abandon"
  --help                Show this help message

Examples:
  chowa route --kind architecture --complexity high
  chowa commit
  chowa pr --base main
  chowa init
  chowa always-on on
  chowa install --agent gemini
  chowa abandon --reason "switched approach"
  chowa ledger status
  chowa ledger sweep
  chowa ledger install

Claude Code doesn't need "install" — it gets Chōwa as a plugin:
  /plugin marketplace add franprince/chowa
  /plugin install chowa@chowa
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

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';

async function handleInstall(agent: string | undefined): Promise<void> {
  const { planInstall, SUPPORTED_AGENTS, AGENT_TARGETS } = await import(
    './integrations/install.js'
  );

  if (!agent) {
    console.error(
      `chowa install requires --agent <harness>. Supported: ${SUPPORTED_AGENTS.join(', ')}.\n` +
        `Claude Code doesn't use this command — install the plugin instead:\n` +
        `  /plugin marketplace add franprince/chowa\n` +
        `  /plugin install chowa@chowa`,
    );
    process.exitCode = 1;
    return;
  }

  try {
    // Search from this module's own directory as well as the working
    // directory, so the command works from `src/cli.ts`, from `dist/`, or
    // from a subdirectory of the repo.
    const plan = planInstall(agent, homedir(), [import.meta.dirname, process.cwd()]);

    mkdirSync(dirname(plan.skillDestination), { recursive: true });
    copyFileSync(plan.skillSource, plan.skillDestination);
    console.log(`✅ Installed the chowa skill to ${plan.skillDestination}`);

    const { globalRulesContent } = await import('./integrations/install.js');
    writeFileSync(plan.rulesDestination, globalRulesContent(), 'utf-8');
    console.log(`✅ Wrote workspace rules to ${plan.rulesDestination}`);
    console.log(`\n${AGENT_TARGETS[agent]!.label} will pick these up on its next session.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function handleInit(): Promise<void> {
  const { planInit, defaultConfigFileContents } = await import('./integrations/initConfig.js');

  try {
    const plan = planInit();
    writeFileSync(plan.targetPath, defaultConfigFileContents(), 'utf-8');
    console.log(`✅ Wrote ${plan.targetPath}`);
    console.log(`\nEdit routing.rules in ${plan.targetPath} to customize model routing.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function handleAlwaysOn(arg: string | undefined): Promise<void> {
  const { defaultPreferencesPath, readPreferences, serializePreferences } = await import(
    './integrations/preferences.js'
  );

  const path = defaultPreferencesPath(homedir());

  if (arg !== undefined && arg !== 'on' && arg !== 'off') {
    console.error(
      `Unknown argument "${arg}" for "chowa always-on". Use "on", "off", or omit it to check status.`,
    );
    process.exitCode = 1;
    return;
  }

  if (arg === 'on' || arg === 'off') {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serializePreferences({ alwaysOn: arg === 'on' }), 'utf-8');
    console.log(
      arg === 'on'
        ? `✅ Chōwa's workflow now applies to every project you work in (${path}).`
        : `✅ Chōwa's workflow now only applies to projects that opt in.`,
    );
    return;
  }

  const prefs = readPreferences(path);
  console.log(`Always-on: ${prefs.alwaysOn ? 'enabled' : 'disabled'}`);
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

async function handleAbandon(reason: string | undefined): Promise<void> {
  const { GitOps } = await import('./git/gitOps.js');
  const { ledgerKey, readLedger, writeLedger, abandonEntry } = await import('./ledger/index.js');

  const gitOps = new GitOps();
  const branch = await gitOps.getCurrentBranch();
  const key = ledgerKey(process.cwd(), branch);

  const ledger = readLedger();
  if (!ledger.entries[key]) {
    console.error(`No ledger entry for ${key} — nothing to abandon.`);
    process.exitCode = 1;
    return;
  }

  writeLedger(abandonEntry(ledger, key, reason));
  console.log(`✅ Abandoned the ledger entry for ${branch} — it will not be auto-resumed.`);
}

async function handleLedgerStatus(): Promise<void> {
  const { readLedger } = await import('./ledger/index.js');

  const entries = Object.entries(readLedger().entries);
  if (entries.length === 0) {
    console.log('No ledger entries.');
    return;
  }

  for (const [key, entry] of entries) {
    console.log(key);
    console.log(`  session:  ${entry.sessionId}`);
    console.log(`  status:   ${entry.status}`);
    if (entry.blockedWindow) {
      console.log(`  blocked:  ${entry.blockedWindow} window, resets ${entry.resetsAt}`);
    }
    console.log(`  attempts: ${entry.resumeAttempts}`);
    console.log('');
  }
}

async function handleLedgerSweep(): Promise<void> {
  const { sweep } = await import('./integrations/claude-code/sweep.js');

  const result = await sweep();

  console.log(`Resumed ${result.resumed.length} session(s).`);
  for (const entry of result.resumed) {
    console.log(`  ✅ ${entry.repoPath}#${entry.branch} (${entry.sessionId})`);
  }
  if (result.failed.length > 0) {
    console.log(`Failed to dispatch ${result.failed.length} entry(ies) — left for the next sweep:`);
    for (const { entry, error } of result.failed) {
      console.log(`  ❌ ${entry.repoPath}#${entry.branch}: ${error}`);
    }
  }
}

async function handleLedgerInstall(): Promise<void> {
  if (process.platform !== 'linux') {
    console.error('chowa ledger install currently only supports Linux (systemd user timers).');
    process.exitCode = 1;
    return;
  }

  const { planTimerInstall } = await import('./integrations/systemd/timer.js');
  const { execFileSync } = await import('node:child_process');

  // Reconstruct exactly how we were invoked (bun|node + this same script's
  // resolved path) so the timer keeps working from src/, dist/, or the
  // bundled plugin, without depending on cwd.
  const execCommand = `"${process.execPath}" "${process.argv[1]}" ledger sweep`;
  const plan = planTimerInstall({ homeDir: homedir(), execCommand });

  try {
    mkdirSync(dirname(plan.serviceUnitPath), { recursive: true });
    writeFileSync(plan.serviceUnitPath, plan.serviceUnitContent, 'utf-8');
    writeFileSync(plan.timerUnitPath, plan.timerUnitContent, 'utf-8');
    console.log(`✅ Wrote ${plan.serviceUnitPath}`);
    console.log(`✅ Wrote ${plan.timerUnitPath}`);

    for (const command of plan.postInstallCommands) {
      execFileSync(command[0]!, command.slice(1), { stdio: 'inherit' });
    }
    console.log('✅ Enabled chowa-resume-sweep.timer — check: systemctl --user list-timers');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
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
      agent: { type: 'string' },
      reason: { type: 'string' },
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

    case 'init':
      await handleInit();
      break;

    case 'always-on':
      await handleAlwaysOn(positionals[1]);
      break;

    case 'install':
      await handleInstall(values.agent);
      break;

    case 'abandon':
      await handleAbandon(values.reason);
      break;

    case 'ledger':
      switch (positionals[1]) {
        case 'status':
          await handleLedgerStatus();
          break;
        case 'sweep':
          await handleLedgerSweep();
          break;
        case 'install':
          await handleLedgerInstall();
          break;
        default:
          console.error(`Unknown "chowa ledger" subcommand: ${positionals[1] ?? '(none)'}. Use status, sweep, or install.`);
          process.exitCode = 1;
      }
      break;

    case 'sync-global':
      console.warn(
        `⚠️  "chowa sync-global" is deprecated — use "chowa install --agent gemini".\n` +
          `   It still works and will be removed in a future release.\n`,
      );
      await handleInstall(values.agent ?? 'gemini');
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

