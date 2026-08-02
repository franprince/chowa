# Chōwa (調和)

> *Harmony across providers* — A coding harness that gives you consistent LLM behavior regardless of which model is doing the work.

Chōwa is a **CLI plus a Claude Code skill**. It enforces a spec → plan → execute pipeline, splits diffs into atomic Conventional Commits, generates PR descriptions, and routes tasks to the right model — normalizing tool-calling across Anthropic, OpenAI, Gemini and local models underneath.

It is not a library you import. There is no npm package; the engine ships inside the plugin. See [Install](#install).

## Why Chōwa?

When using LLMs as coding agents, every provider has different:
- **Tool-call formats** — stringified JSON (OpenAI), already-parsed objects (Anthropic), missing IDs (Gemini)
- **Response shapes** — different nesting, different block types, different quirks
- **Reliability** — some need JSON repair, some need retry loops

Chōwa normalizes all of this behind one CLI, so the workflow you get doesn't change when the model does. On top of that it enforces git workflow conventions (atomic commits, Conventional Commits, PR descriptions) and routes tasks by complexity.

## Architecture

```mermaid
graph TD
    subgraph "Application Code"
        APP[Your Code / CLI / IDE Extension]
    end

    subgraph "Integrations Layer"
        AG[Antigravity Bridge]
        CC[Claude Code Bridge]
        VS[VS Code Extension]
    end

    subgraph "Core Library (provider-agnostic)"
        CLIENT[ChowaClient]
        ROUTER[Model Router]
        VALIDATE[Validation Loop]

        subgraph Adapters
            ANTH[Anthropic]
            OAI[OpenAI]
            GEM[Gemini]
            LOCAL[Local/Ollama]
        end

        subgraph "Git Workflow"
            SPLIT[Diff Splitter]
            COMMIT[Commit Message Gen]
            PR[PR Description Gen]
        end
    end

    APP --> AG & CC & VS
    AG & CC & VS --> CLIENT
    CLIENT --> ROUTER
    CLIENT --> VALIDATE
    CLIENT --> Adapters
    COMMIT --> CLIENT
    PR --> CLIENT

    style AG fill:#4a9eff,color:#fff
    style CC fill:#4a9eff,color:#fff
    style VS fill:#666,color:#fff,stroke-dasharray: 5 5
```

> Dashed boxes = planned, not yet implemented.

### Key Constraint

**Dependencies flow one direction: integrations → core, never reverse.** No file under `src/core/`, `src/adapters/`, `src/router/`, or `src/git/` may import from `src/integrations/`. This is enforced by a boundary test and a standalone check script.

## Install

### Claude Code

Two commands. No clone, no `npm install`, no copying files around — the engine ships inside the plugin.

```
/plugin marketplace add franprince/chowa
/plugin install chowa@chowa
```

Then opt a project in by adding a `chowa.config.ts` (or `.js`/`.mjs`) at its root. Without one, the skill deliberately stays out of the way and defers to whatever conventions that project already has — installing Chōwa means having it available, not applying it everywhere.

**If `marketplace add` fails to clone:** GitHub `owner/repo` shorthand clones over SSH by default. If you authenticate over HTTPS (`gh auth login`), set `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1`. This is the most common first-run problem.

**Migrating from the manual install:** delete any hand-copied `~/.claude/skills/chowa/SKILL.md`. It will otherwise sit alongside the plugin's copy and the two can disagree.

### Other harnesses (Gemini, Antigravity)

These have no plugin system, so they still need a file drop, and — with npm out of the picture — a checkout of this repo:

```bash
git clone https://github.com/franprince/chowa.git && cd chowa
bun install
bun run src/cli.ts install --agent gemini
```

### Integration pitfall: `chowa` as a local `file:` dependency breaks consumer CI

When `chowa` is added to a project via `bunx chowa init` (or manually) as a `file:../chowa`-style sibling-directory dependency, it MUST be declared under `optionalDependencies`, not `dependencies`/`devDependencies`.

**Why:** `file:` dependencies resolve relative to the consuming project's location on disk. That sibling checkout only exists on the machine where `chowa` was cloned next to the project — it does not exist in CI runners, Docker builds, or any other machine that clones just the consumer repo. A plain `bun install` (or `npm install`) there fails immediately with `ENOENT: failed opening cache/package/version dir for package chowa`, taking down the whole install — even though chowa itself is never imported by application code and isn't needed to build, test, or run the project.

**Required setup in the consumer project:**

1. `package.json`:
   ```json
   "optionalDependencies": {
     "chowa": "file:../chowa"
   }
   ```
2. Any CI workflow install step:
   ```bash
   bun install --frozen-lockfile --omit=optional
   ```
   *(npm equivalent: `npm ci --omit=optional`)*

This keeps `bunx chowa commit` / `chowa pr` working locally for the maintainer while making CI installs independent of the sibling checkout.

If chowa's own init/setup flow writes the dependency entry into a project's `package.json`, it should write it under `optionalDependencies` by default, not `devDependencies` — this failure mode is not project-specific and will recur in every consumer repo otherwise.

### Runtime

The bundled engine runs on **Node 20+** or Bun. One caveat: reading a `chowa.config.**ts**` at runtime needs TypeScript type stripping, which Node only enables unflagged from 22.18. On older Node, use `chowa.config.js` — it needs no type stripping and works everywhere. Bun reads either natively. Chōwa tells you which applies if it hits the case.

## Working on Chōwa itself

```bash
bun install
bun run verify          # tests + import boundaries + build + type-check

# The CLI, from source
bun run src/cli.ts route --kind architecture --complexity high
bun run src/cli.ts commit
bun run src/cli.ts pr --base main
bun run src/cli.ts models --provider anthropic
bun run src/cli.ts route --kind mechanical --complexity low --config ./my-chowa.config.ts

# Structured JSON-in/JSON-out bridges for agent tooling
bun run src/cli.ts claude-code-bridge   # reads a request from stdin
bun run src/cli.ts antigravity-bridge   # reads a request from stdin

# Plugin maintenance
bun run sync:skill      # regenerate .agents/ skill from the canonical one
bun run build:plugin    # rebuild the bundled engine (release/* branches only)
```

### How the plugin is distributed

This repository *is* the distribution channel — the marketplace catalog lives at `.claude-plugin/marketplace.json` and serves the plugin in `plugins/chowa/`.

- `plugins/chowa/skills/chowa/SKILL.md` is the **canonical** skill. `.agents/skills/chowa/SKILL.md` is generated from it by `bun run sync:skill`; don't edit it by hand. `.claude/skills/chowa/SKILL.md` is project-local to this repo and governs work here only.
- `plugins/chowa/dist/cli.js` is the bundled engine. It exists **only on `main`**, built during the `release/*` process, so `develop` and feature branches never carry a generated file and never conflict on one. CI enforces both halves: it fails a PR into `main` whose bundle is stale, and fails a PR anywhere else that commits one.

## Project Structure

```
src/
├── core/                    # Canonical types, errors, validation
│   ├── types.ts             # CanonicalTool, CanonicalToolCall, CanonicalMessage, etc.
│   ├── errors.ts            # ValidationError, AdapterError, ProviderError
│   ├── validate.ts          # Zod-based tool call validation with retry messages
│   └── index.ts
├── adapters/                # Provider-specific encode/decode
│   ├── anthropic.ts         # ✅ Full implementation (reference adapter)
│   ├── gemini.ts            # ✅ Full implementation (deterministic tool-call ID synthesis)
│   ├── openai.ts            # 📝 Stub with TODOs
│   ├── local.ts             # 📝 Stub with TODOs
│   ├── registry.ts          # Adapter lookup + custom registration
│   └── index.ts
├── router/                  # Task → model routing
│   ├── types.ts             # TaskProfile, RoutingRule, RoutingPolicy
│   ├── router.ts            # Pure resolve() function with audit logging + model tier resolution
│   ├── loadPolicy.ts        # Loads RoutingPolicy from chowa.config.ts (or --config), with validation
│   └── index.ts
├── git/                     # Git workflow enforcement
│   ├── types.ts             # DiffHunk, DiffCluster, CommitInfo, PRDescription
│   ├── diffSplitter.ts      # Parse diffs, cluster by file (extensible)
│   ├── commitMessage.ts     # Generate Conventional Commits via LLM
│   ├── prDescription.ts     # Generate PR descriptions from commit history
│   ├── gitOps.ts            # Thin simple-git wrapper
│   └── index.ts
├── integrations/            # Integration surfaces (depend on core, never reverse)
│   ├── antigravity/
│   │   ├── skill.md         # Antigravity skill file
│   │   ├── bridge.ts        # Request/response translation
│   │   └── index.ts
│   └── claude-code/
│       ├── bridge.ts        # Request/response translation (ClaudeCodeBridge)
│       └── index.ts
├── client.ts                # Unified ChowaClient
├── cli.ts                   # CLI entry point
└── index.ts                 # Top-level barrel export

.claude/skills/chowa/SKILL.md   # Claude Code skill — chowa's own dev workflow (also synced to ~/.claude/skills/)
.agents/skills/chowa/SKILL.md   # Same workflow for other agent harnesses (Antigravity, Gemini via sync-global)
specs/<date>-<slug>/            # Persisted spec.md + implementation_plan.md per change, indexed in specs/INDEX.md

tests/
├── adapters/
│   ├── anthropic.test.ts
│   └── gemini.test.ts
├── core/validate.test.ts
├── router/
│   ├── router.test.ts
│   └── loadPolicy.test.ts
├── git/
│   ├── diffSplitter.test.ts
│   ├── commitMessage.test.ts
│   └── prDescription.test.ts
├── integrations/
│   ├── antigravity.test.ts
│   └── claude-code.test.ts
├── examples/weather-tool.test.ts
├── boundary.test.ts
└── fixtures/
    ├── anthropic-response.json
    ├── anthropic-response-malformed.json
    ├── gemini-response.json
    ├── gemini-response-malformed.json
    ├── chowa-config-valid.config.ts
    ├── chowa-config-invalid.config.ts
    ├── sample-diff-mixed.patch
    └── sample-diff-single.patch
```

## Model Routing

Chōwa routes tasks to models based on a configurable policy read from `chowa.config.ts` at the repo root (or a path passed via `--config`):

| Task Profile | Default Model | Rationale |
|---|---|---|
| `mechanical/*` | Gemini 3.6 Flash | Fastest, cheapest |
| `security/*` | Claude Opus 4.6 | Strongest reasoning, pinned |
| `architecture/high` | Claude Opus 4.6 | Complex design decisions |
| `refactor/*` | Gemini 3.6 Flash | Fast workhorse, Sonnet fallback |
| `debug/*` | Gemini 3.6 Flash | Speed & context, Sonnet fallback |
| Default | Gemini 3.6 Flash | Safe general-purpose, Sonnet fallback |

Each target can declare `fallbacks` — if a call to the primary provider/model fails, `ChowaClient.call()` automatically retries against the next fallback target in order, and the result reports whether a fallback was used. Routing decisions are logged with the matched rule (`RoutingDecision.reason`) and can be overridden via CLI flags.

If no `chowa.config.ts` is found at the resolved path, Chōwa falls back to a built-in default policy. An explicitly-passed `--config <path>` that doesn't exist, or a config file with an invalid shape, fails loudly rather than silently falling back — see `src/router/loadPolicy.ts`.

## Roadmap

- [x] Core canonical types
- [x] Anthropic adapter (reference implementation)
- [x] Validation loop with retry messages
- [x] Model router with policy config
- [x] Git diff splitter (file-based clustering)
- [x] Commit message generation (Conventional Commits)
- [x] PR description generation
- [x] Antigravity integration
- [x] Claude Code integration (`ClaudeCodeBridge`, `chowa claude-code-bridge`, Claude Code skill)
- [x] Gemini adapter (deterministic tool-call ID synthesis)
- [x] Config-driven routing (`chowa.config.ts` / `--config` actually loaded, validated, and type-checked)
- [x] Automatic provider/model failover via `RoutingTarget.fallbacks`
- [x] Boundary enforcement (test + script)
- [ ] OpenAI adapter (JSON string parsing, jsonrepair)
- [ ] Local model adapter (prompt-based structured output)
- [ ] Hunk-level diff clustering
- [ ] Real HTTP transport for providers
- [ ] VS Code extension integration

## Development Workflow

Chōwa develops itself (dogfooding) via its own skill conventions:

- **Spec → Plan → Execute.** Non-trivial changes start with a `spec.md`, then an `implementation_plan.md`, each requiring explicit approval before moving on. Both are persisted under `specs/<YYYY-MM-DD>-<slug>/` — never as loose root files — and indexed in [`specs/INDEX.md`](specs/INDEX.md), so intent doesn't drift or get silently overwritten across iterations.
- **Branch flow.** `fix/*`, `feat/*`, `docs/*`, `chore/*` branch from and PR against `develop`. Only `release/*` and `hotfix/*` branch from `develop` (or `main` for a hotfix) and PR to `main`. Never push or PR directly to `main`/`master` otherwise.
- **Conventional Commits**, atomic per logical change, verified with `bun test`, `bun run check:imports`, and `bun run build` before opening a PR.

Full rules live in [`.agents/skills/chowa/SKILL.md`](.agents/skills/chowa/SKILL.md) (general agent harnesses) and [`.claude/skills/chowa/SKILL.md`](.claude/skills/chowa/SKILL.md) (Claude Code — also installed at `~/.claude/skills/chowa/` so it's available in any project, not just this repo).

## License

MIT
