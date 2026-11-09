# Agent Plugins

A Claude Code plugin marketplace for agent-driven development workflows.

## bmad-github

BMAD + GitHub story workflow orchestration with git worktrees for parallel agent development.

This plugin bridges the [BMAD Method](https://docs.bmad-method.org/) with GitHub project management. BMad's
`bmad-build` plans, implements and reviews one story at a time; it does not own the backlog, pick the next story, push,
or open a PR. This plugin adds exactly that: GitHub issues and milestones from your epics, one git worktree per story,
a PR that closes the story's issue, and a story marked `done` only after you merge that PR.

Tested with **BMad v6.12.4**.

### Why a Claude Code plugin?

BMAD modules are conversational guides — they tell the AI *what to do* step by step. This plugin operates at the
**runtime/DevOps layer**, orchestrating those same BMAD workflows while managing `gh`, `git worktree`, branches, labels,
milestones and PRs. These are concerns that BMAD's module system isn't designed to handle.

### Prerequisites

- [Claude Code](https://claude.com/claude-code) installed
- [`gh` CLI](https://cli.github.com/) installed and authenticated (`gh auth login`)
- [Node.js](https://nodejs.org/) v20.12+ (BMad's installer and the batch sync script)
- [`uv`](https://docs.astral.sh/uv/) — BMad v6.11+ runs its Python scripts through `uv run`, and `bmad-build` halts
  without it. `uv` provisions Python itself.
- A project with **BMad v6.12+** and the BMad Method module (`bmm`) installed. The plugin reads every path from BMad's
  own config resolver (`_bmad/scripts/resolve_config.py`), so it honours `_bmad/custom/config.toml` and
  `_bmad/custom/config.user.toml` overrides.

### Installation

This package is **both** a Claude Code plugin *and* a BMAD module — the same skill folders serve both ecosystems.

**For Claude Code users:**

```bash
/plugin marketplace add choucrifahed/agent-plugins
/plugin install bmad-github@cfahed
```

**For BMAD users (so the skills show up in `bmad help`):**

```bash
npx bmad-method install --custom-source https://github.com/choucrifahed/agent-plugins/tree/main/bmad-github/skills
```

Point `--custom-source` at the `bmad-github/skills` folder: that is where `module.yaml` and `module-help.csv` live.
Pointing it at the repository root installs nothing.

You can install one or both — the same skills get registered.

### Skills

The plugin's skills invoke BMad's own skills (`bmad-build`, `bmad-code-review`) under the hood, so **updating BMad
updates the behaviour the plugin relies on**. Each skill folder is self-contained, following BMad's skill layout.

| Invoke | `bmad help` code | Branch | Description |
|--------|------------------|--------|-------------|
| `/story-init` | `SI`  | `main` | Sync BMad epics to GitHub — creates milestones, labels, and issues from `epics.md` |
| `/story-build` | `SB`  | `main` *or* a `story/<key>` worktree | Pick the next story (or use the current worktree's branch), claim its issue, create or reuse a worktree, invoke `bmad-build` to plan, implement and review it, then push and open a PR that closes the issue |
| `/story-open-pr` | `SPR` | `story/<key>` worktree | Push the story branch and open (or update) its PR with `Closes #N`, shared labels, and `status:review`. `/story-build` runs it for you |
| `/story-review` | `SR`  | `story/<key>` worktree | **Optional** extra review of the open PR with `bmad-code-review`; pushes fixes. Never marks the story `done` |
| `/story-sync` | `SY`  | `main` | After a PR merges: mark the story `done` in `sprint-status.yaml` and on GitHub, promote finished epics, clean up the worktree and branch |
| `/story-setup-ci` | `SCI` | `main` | Install the BMAD Story Sync GitHub Actions workflow, which does the `/story-sync` writes automatically when a PR closes its issue |

In Claude Code, type the slash form (e.g. `/story-build`) at the prompt. In a BMAD `bmad help` session, type the menu
code (e.g. `SB`). Both invoke the same skill.

### Workflow

```
bmad-create-epics-and-stories ──► bmad-sprint-planning ──► /story-init
                                                               │
          ┌────────────────────────────────────────────────────┘
          ▼
     /story-build ──► (optional) /story-review ──► you merge the PR ──► /story-sync
          ▲                                                                 │
          └──────────────────────────── next story ◄────────────────────────┘
```

This mirrors BMad's own implementation chain, `bmad-sprint-planning → bmad-build → bmad-code-review`.

- `/story-build` already reviews the change: `bmad-build` runs independent reviewers and fixes what belongs to the
  story before the PR opens. `/story-review` is the optional extra pass BMad describes for `bmad-code-review` — for
  example after you address PR comments, or with a different model.
- BMad recommends a fresh chat for each `bmad-build` run, so start `/story-build` in a new session when you can.
- `bmad-build` may stop before implementing: when you choose "Approve and stop" on its plan, or when it needs an
  answer only you can give. Re-run `/story-build` in the story's worktree to resume.
- Re-run `/story-init` whenever you add or rename epics. `/story-setup-ci` is optional but recommended.

The user is always the quality gate — no story is marked `done` without a human-merged PR. If an issue is closed without
a merged PR, `/story-sync` warns rather than silently cleaning up the worktree.

### Deprecated skills

BMad v6.11 made `bmad-build` its official implementation flow and deprecated `bmad-create-story` and `bmad-dev-story`.
This plugin follows suit:

| Deprecated | Menu code | Replaced by | Works while |
|---|---|---|---|
| `/story-create` | `SC` (removed from `bmad help`) | `/story-build`, which plans and builds in one run | BMad's `bmad-create-story` is installed |
| `/story-dev` | `SD` (removed from `bmad help`) | `/story-build` | BMad's `bmad-dev-story` is installed |

BMad v6.12 leaves its deprecated skills out of fresh installs. To keep using `/story-create` and `/story-dev` until
BMad v7 removes them, run the BMad installer with `--shims`; this plugin's two deprecated skills are marked the same
way, so they install exactly when BMad's do. As a Claude Code plugin they are always listed, and stop with an
explanation when BMad's deprecated skills are missing. A story file written by `/story-create` is picked up by
`/story-build` as its intent.

### Upgrading to 2.0.0

**Breaking changes:**
- **BMad v6.12+ and `uv` are required** (previously BMad v6.6+). Every path now comes from BMad's config resolver,
  which runs through `uv run`.
- **`.claude/bmad-github.local.md` is no longer read.** If you set `worktree-root` there, move it to
  `_bmad/custom/config.toml` (or `config.user.toml`) as `worktree_root` under `[modules.bmad-github]`. Until you do,
  new worktrees go to the default `../{repo-name}-worktrees`.
- **Story Sync's `bmad help` code is now `SY`** (was `SS`, which is BMad's own Sprint Status code).
- **BMAD install source moved:** use `--custom-source https://github.com/choucrifahed/agent-plugins/tree/main/bmad-github/skills`.
- **Story Sync CI workflow:** re-run `/story-setup-ci` to get the new template. It installs `uv` and needs BMad's
  `_bmad/` folder committed.

**Other changes:**
- New `/story-build` replaces `/story-create` + `/story-dev` (deprecated, see above).
- New `/story-open-pr` holds the push-and-PR steps that `/story-build` and `/story-dev` share.
- `/story-review` is now an optional extra pass.
- `/story-build` makes no per-task commits: `bmad-build` commits the reviewed change itself. Only the deprecated
  `/story-dev` still commits per task.
- The plugin no longer installs a `SessionStart` hook; each skill loads BMad's config itself.

### Configuration

#### Worktree root

`worktree_root` is a BMad module setting, asked when you install the module with BMad and stored in
`_bmad/config.toml` under `[modules.bmad-github]`. Override it the way BMad documents for any setting — never by editing
the installer-owned `_bmad/config.toml`:

```toml
# _bmad/custom/config.toml       (team, committed)
# _bmad/custom/config.user.toml  (personal, gitignored)
[modules.bmad-github]
worktree_root = "../my-project-worktrees"
```

| Key | Default | Description |
|-----|---------|-------------|
| `worktree_root` | `../{repo-name}-worktrees` | Directory where git worktrees are created, relative to the main checkout |

If you only installed the Claude Code plugin, the key is absent and the default applies.

#### BMAD paths

The plugin reads `planning_artifacts` and `implementation_artifacts` from BMad's merged config, by running
`uv run _bmad/scripts/resolve_config.py`. Every BMad v6.12 skill reads its config the same way. `epics.md` is read from
`planning_artifacts`; `sprint-status.yaml`, story specs, and `github-issue-map.json` live in `implementation_artifacts`.

The Story Sync CI workflow runs the same resolver, so the repository must commit BMad's `_bmad/` folder. It sees only
the committed layers (`_bmad/config.toml`, `_bmad/custom/config.toml`).

### Epics → Milestones

Each BMAD epic from `{planning_artifacts}/epics.md` becomes a GitHub milestone titled `Epic <N>: <Title>` 
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

When `/story-build` creates a PR, it inspects the diff and adds labels for detected file types:

| File pattern | Label |
|---|---|
| `*.ts`, `*.tsx` | `typescript` |
| `*.js`, `*.mjs`, `*.cjs` | `javascript` |
| `*.css`, `*.scss` | `css` |
| `*.html` | `html` |
| `.github/**` | `github_actions` |
| `*.md` (outside `planning_artifacts` and `implementation_artifacts`) | `documentation` |
| `package.json`, `pnpm-lock.yaml` | `dependencies` |
| `*.test.ts`, `*.test.js`, `__tests__/**` | `qa` |

These are merged with the existing issue labels and applied to both the PR and the issue.

### Status Lifecycle

Exactly one `status:*` label is active on each issue at a time. As a story progresses through the workflow, the previous
status label is removed and the new one is added:

| BMAD Status | GitHub Label | Set by | Notes |
|---|---|---|---|
| *(initial)* | `status:backlog` | `/story-init` | Applied at issue creation |
| ready-for-dev | `status:ready` | `/story-create` (deprecated) | Story file planned; `/story-build` picks these first |
| in-progress | `status:in-progress` | `/story-build` | Issue claimed; worktree created or reused |
| review | `status:review` | `/story-build` | PR created; `/story-review` keeps this status |
| done | `status:done` | `/story-sync` on `main` (and/or `bmad-story-sync` CI on PR merge — idempotent) | Issue is also closed |

`bmad-build` moves the story to `in-progress` and then `review` in `sprint-status.yaml` inside the worktree; those
edits reach `main` with the PR. Only merging the PR advances a story to `done`. `bmad-build` also marks its own spec
file `done` when it finishes building; the plugin leaves that field to `bmad-build`.

### Parallel Development

Each story runs in its own git worktree on its own branch, so multiple agents can work in parallel without colliding.
`/story-build` creates a worktree from `main`, or reuses one if you're already inside a `story/<key>` branch — so it
composes cleanly with orchestrators like [Conductor](https://conductor.build/) that spawn each agent in a pre-created
worktree.

## License

MIT
