# Agent Plugins

A Claude Code plugin marketplace for agent-driven development workflows.

## hermes-tweet

Native Hermes Agent X/Twitter plugin with read-first workflows and
approval-gated actions.

```bash
hermes plugins install Xquik-dev/hermes-tweet --enable
```

See [`hermes-tweet/README.md`](hermes-tweet/README.md) for install notes and
runtime gating.

Xquik is an independent third-party service. Not affiliated with X Corp.
"Twitter" and "X" are trademarks of X Corp.

## bmad-github

BMAD + GitHub story workflow orchestration with git worktrees for parallel agent development.

This plugin bridges [BMAD Method](https://docs.bmad-method.org/) workflows with GitHub project management.
It orchestrates BMAD's create-story, dev-story, and code-review workflows while adding GitHub issue sync, git worktree
management, auto-commits per task, and PR creation.

### Why a Claude Code plugin?

BMAD modules are conversational guides - they tell the AI *what to do* step by step. This plugin operates at the
**runtime/DevOps layer**, orchestrating those same BMAD workflows while managing `gh`, `git worktree`, branches, labels,
milestones and PRs. These are concerns that BMAD's module system isn't designed to handle.

### Prerequisites

- [Claude Code](https://claude.com/claude-code) installed
- [`gh` CLI](https://cli.github.com/) installed and authenticated (`gh auth login`)
- [Node.js](https://nodejs.org/) (for the batch sync script)
- A project using the [BMAD Method](https://docs.bmad-method.org/) with `_bmad/` directory (output folder is read from 
  `_bmad/bmm/config.yaml`, defaults to `_bmad-output/`)

### Installation

This package is **both** a Claude Code plugin *and* a BMAD v6.6+ module - same files serve both ecosystems.

**For Claude Code users:**

```bash
/plugin marketplace add choucrifahed/agent-plugins
/plugin install bmad-github@cfahed
```

**For BMAD users (so the commands show up in `bmad help`):**

```bash
npx bmad-method install --custom-source https://github.com/choucrifahed/agent-plugins
```

You can install one or both - the same six skills get registered.

### Skills

The plugin provides six skills that form a story lifecycle. These skills orchestrate BMAD's **own
operations (create-story, dev-story, code-review) under the hood** - if you **update** your BMAD modules, the
plugin **automatically picks up the changes**.

| Invoke | `bmad help` code | Branch | Description |
|--------|------------------|--------|-------------|
| `/story-init` | `SI`  | `main` | Batch sync BMAD epics to GitHub - creates milestones, labels, and issues from `epics.md` |
| `/story-setup-ci` | `SCI` | `main` | Install the BMAD Story Sync GitHub Actions workflow (redundant safety net that writes `sprint-status.yaml` on issue close) |
| `/story-create` | `SC`  | `main` (recommended) or any worktree | Run BMAD create-story to plan a story; dependency check via GitHub labels; marks the GitHub issue `status:ready` |
| `/story-dev` | `SD`  | `main` *or* a `story/<key>` worktree | Pick a ready story (or use the current worktree's branch), flip the GitHub label to `in-progress`, create or reuse a worktree, run BMAD dev-story with auto-commits, open a PR |
| `/story-review` | `SR`  | `story/<key>` worktree | Run BMAD adversarial code review and push fixes (does NOT mark story as done) |
| `/story-sync` | `SS`  | `main` | Reconcile BMAD files with GitHub on `main` (writes `sprint-status.yaml`, story file `Status:` lines, GH labels, epic promotion) and clean up worktrees/branches for completed stories |

In Claude Code, type the slash form (e.g. `/story-dev`) at the prompt. In a BMAD `bmad help` session, type the menu code (e.g. `SD`). Both invoke the same skill.

### Workflow

```
/story-init ──► /story-create ──► /story-dev ──► /story-review
                      │                                │
                      │         ◄── (fix issues) ◄─────┘
                      │
                      └──────── /story-sync ◄── (user merges PR on GitHub)
```

Re-run `/story-init` whenever you add or rename epics. `/story-setup-ci` is optional but recommended - it installs a
GitHub Actions workflow that performs the same writes as `/story-sync` whenever a PR closes its issue.

The user is always the quality gate - no story is marked `done` without a human-merged PR. If an issue is closed without
a merged PR, `/story-sync` warns rather than silently cleaning up the worktree.

### Configuration

The plugin stores per-project configuration in `.claude/bmad-github.local.md`:

```yaml
---
worktree-root: ../my-project-worktrees/
---
```

| Field | Default | Description |
|-------|---------|-------------|
| `worktree-root` | `../<repo-name>-worktrees/` | Directory where git worktrees are created |

This file is auto-created on first run of `/story-dev` or `/story-sync`.

#### BMAD Output Folder

The plugin reads the BMAD output folder from `_bmad/bmm/config.yaml` or `_bmad/bmb/config.yaml` (`output_folder` key).
If no config is found, it defaults to `_bmad-output`. This makes the plugin portable across different BMAD setups.

### Epics → Milestones

Each BMAD epic from `<output_folder>/planning-artifacts/epics.md` becomes a GitHub milestone titled `Epic <N>: <Title>` 
(e.g., `Epic 1: Core Infrastructure`). Creation is idempotent - existing milestones are skipped. Every story issue is
assigned to the milestone matching its epic number.

### Labels

The plugin manages two categories of labels, all created automatically by `/story-init`.

#### Type Labels

Each story receives a type label based on keywords in its title (first match wins):

| Keyword(s) in title | Label |
|---|---|
| `documentation`, `onboarding` | `documentation` |
| `pipeline`, `release automation`, `publishing` | `github_actions` |
| `validation` (but not `standalone`, `editor`, `sync`) | `qa` |
| `scaffold` + `tooling` or `linting` | `dependencies` |
| *(default)* | `enhancement` |

#### File-Based Labels (at PR time)

When `/story-dev` creates a PR, it inspects the diff and adds labels for detected file types:

| File pattern | Label |
|---|---|
| `*.ts`, `*.tsx` | `typescript` |
| `*.js`, `*.mjs`, `*.cjs` | `javascript` |
| `*.css`, `*.scss` | `css` |
| `*.html` | `html` |
| `.github/**` | `github_actions` |
| `*.md` (excluding `<output_folder>/`) | `documentation` |
| `package.json`, `pnpm-lock.yaml` | `dependencies` |
| `*.test.ts`, `*.test.js`, `__tests__/**` | `qa` |

These are merged with the existing issue labels and applied to both the PR and the issue.

### Status Lifecycle

Exactly one `status:*` label is active on each issue at a time. As a story progresses through the workflow, the previous
status label is removed and the new one is added:

| BMAD Status | GitHub Label | Set by | Notes |
|---|---|---|---|
| *(initial)* | `status:backlog` | `/story-init` | Applied at issue creation |
| ready-for-dev | `status:ready` | `/story-create` | Story has been planned |
| in-progress | `status:in-progress` | `/story-dev` | Worktree created or reused; development started |
| review | `status:review` | `/story-dev` | PR created; `/story-review` keeps this status |
| done | `status:done` | `/story-sync` on `main` (and/or `bmad-story-sync` CI on PR merge - idempotent) | Issue is also closed |

`/story-review` deliberately stops at `review` - only merging the PR advances a story to `done`.

### Parallel Development

Each story runs in its own git worktree on its own branch, so multiple agents can work in parallel without colliding.
`/story-dev` creates a worktree from `main`, or reuses one if you're already inside a `story/<key>` branch - so it
composes cleanly with orchestrators like [Conductor](https://conductor.build/) that spawn each agent in a pre-created
worktree.

## License

MIT
