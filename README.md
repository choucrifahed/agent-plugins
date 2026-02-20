# Agent Plugins

A Claude Code plugin marketplace for agent-driven development workflows.

## bmad-github

BMAD + GitHub story workflow orchestration with git worktrees for parallel agent development.

This plugin bridges [BMAD Method](https://bmad-builder-docs.bmad-method.org/) workflows with GitHub project management.
It orchestrates BMAD's create-story, dev-story, and code-review workflows while adding GitHub issue sync, git worktree
management, auto-commits per task, and PR creation.

### Why a Claude Code plugin?

BMAD modules are conversational guides — they tell the AI *what to do* step by step. This plugin operates at the
**runtime/DevOps layer**, orchestrating those same BMAD workflows while managing `gh`, `git worktree`, branches, labels,
milestones and PRs. These are concerns that BMAD's module system isn't designed to handle.

### Prerequisites

- [Claude Code](https://claude.com/claude-code) installed
- [`gh` CLI](https://cli.github.com/) installed and authenticated (`gh auth login`)
- [Node.js](https://nodejs.org/) (for the batch sync script)
- A project using the [BMAD Method](https://bmad-builder-docs.bmad-method.org/) with `_bmad/` directory (output folder is read from `_bmad/bmm/config.yaml`, 
  defaults to `_bmad-output/`)

### Installation

```bash
/plugin marketplace add choucrifahed/agent-plugins
/plugin install bmad-github@cfahed
```

### Commands

The plugin provides six slash commands that form a story lifecycle. These commands orchestrate BMAD's **own
workflows (create-story, dev-story, code-review) under the hood** — if you **update** your BMAD modules, the
plugin **automatically picks up the changes**.

| Command | Description                                                                   |
|---------|-------------------------------------------------------------------------------|
| `/story-init` | Batch sync BMAD epics to GitHub — creates milestones, labels, and issues from `epics.md` |
| `/story-setup-ci` | Install the BMAD Story Sync GitHub Actions workflow into the current project |
| `/story-create` | Sync GitHub state, then run BMAD create-story workflow to plan a story, marks the GitHub issue in ready |
| `/story-dev` | Create a git worktree, run BMAD dev-story workflow with auto-commits per task, then create a PR |
| `/story-review` | Run BMAD adversarial code review and push fixes (does NOT mark story as done) |
| `/story-sync` | Reconcile GitHub state with BMAD files — detects merged PRs, marks stories done, cleans up worktrees |

### Workflow

```
story-init ──► story-create ──► story-dev ──► story-review
                    │                              │
                    │         ◄── (fix issues) ◄───┘
                    │
                    └──────── story-sync ◄── (user merges PR on GitHub)
```

1. **`/story-init`** — Run once to create GitHub milestones and issues from your BMAD epics.
                       You can also run it everytime you change your roadmap in BMAD to add new issues and milestones
                       in GitHub.
1. **`/story-setup-ci`** — Run once to install the GitHub Actions workflow that auto-syncs issue closures to BMAD files.
2. **`/story-create`** — Pick the next story, run the BMAD planning workflow, update GitHub labels.
3. **`/story-dev`** — Set up a git worktree, implement the story with granular commits, open a PR.
4. **`/story-review`** — Run BMAD code review; the story stays at `review` status (not `done`).
5. The **user** reviews and merges the PR on GitHub (quality gate).
6. **`/story-sync`** — Detects the merged PR, marks the story as `done` in BMAD, cleans up the worktree and branch.

The user is always the quality gate — no story is marked done without human review and merge. If an issue is closed
manually (without a merged PR), `/story-sync` will warn and ask the user for feedback rather than marking it done and
cleaning up the worktree.

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
(e.g., `Epic 1: Core Infrastructure`). Creation is idempotent — existing milestones are skipped. Every story issue is 
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
| in-progress | `status:in-progress` | `/story-dev` | Worktree created, development started |
| review | `status:review` | `/story-dev` | PR created; `/story-review` keeps this status |
| done | `status:done` | `/story-sync` | Issue is also closed |

The `/story-review` command intentionally does **not** advance status to `done` — the user must merge the PR on GitHub
first. `/story-sync` then detects the merge, marks the story done in BMAD, closes the issue, and cleans up the worktree.

### Parallel Development

Each story gets its own git worktree and branch. Multiple Claude Code agents can work simultaneously — each in its own
worktree directory, on its own branch — without interfering with each other or the main repo.

### BMAD Companion Module

A companion BMAD extension module is included at `bmad-github/bmad-module/`. It registers the 6 story lifecycle
workflows in BMAD's help system (phase-4, implementation) so they're discoverable through `bmad help`. The module
provides discoverability only — execution requires this Claude Code plugin. See
[bmad-module/README.md](bmad-github/bmad-module/README.md) for installation instructions.

## License

MIT
