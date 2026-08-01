---
name: chowa
description: >
  Chowa coding harness — invoke tool-call normalization, git workflow enforcement,
  and model routing from within your coding agent session. Provides consistent
  Conventional Commits, atomic commit splitting, and PR description generation
  regardless of which LLM provider is doing the work.
---

# Chowa Skill

Chowa is a coding harness that normalizes LLM tool-calling, enforces git workflow
conventions, and routes tasks to the right model. Use the commands below to invoke
Chowa from your agent session.

## Available Commands

### Commit Workflow

Split your working-tree diff into atomic commits with Conventional Commits messages:

```bash
chowa commit
```

This will:
1. Read the current git diff
2. Split unrelated changes into separate clusters
3. Generate a Conventional Commits message for each cluster
4. Stage and commit each cluster separately

### PR Description

Generate a structured PR description from your branch's commit history:

```bash
chowa pr --base main
```

Outputs a PR description with:
- Summary (why this PR exists)
- Changes (derived from atomic commit messages)
- Testing notes
- Breaking changes (if any)

### Model Routing

Check which model would be selected for a task:

```bash
chowa route --kind architecture --complexity high
```

### Direct LLM Call (Normalized)

Make a tool-calling LLM request through the normalization layer:

```bash
chowa call --provider anthropic --model claude-sonnet-4.6
```

## Configuration

Chowa reads its routing policy from `chowa.config.ts` at the repo root.
See the default config for the available options.

## Integration Notes

- Chowa treats all providers equally — Gemini, Claude, OpenAI, and local models
  are all first-class citizens with no default preference
- The Antigravity integration is a thin surface layer; all logic lives in Chowa's core
- Routing decisions are logged and can be overridden via CLI flags
