# bmad-github: BMAD Module Analysis

## Question I asked

I'm about to publish the 'bmad-github' plugin. However, I discovered that BMAD already offered a module to customize the behavior of BMAD (https://bmad-builder-docs.bmad-method.org/). Should I restart the implementation of the plugin or
not? Are there enhancements that could be made to the plugin so it fits better in the BMAD ecosystem?

## Should You Restart? No.

The `bmad-github` plugin and BMAD Builder modules operate at **different layers** and serve **complementary purposes**. Restarting would discard solid work that fills a gap BMAD modules can't fill on their own.

### Why They're Different

**BMAD modules** are bundles of agents + workflows + configuration that integrate with BMAD's help/recommendation engine and phase-based workflow sequencing. They're conversational guides — they tell the AI *what to do* step by step.

**The bmad-github plugin** operates at the Claude Code level, *orchestrating* BMAD workflows while adding GitHub CLI integration, git worktree management, auto-commits, PR creation, and label syncing. These are runtime/DevOps concerns that BMAD's module system isn't designed to handle.

The key tell: BMAD modules don't have access to `gh`, `git worktree`, or bash execution. The plugin does — that's its value.

---

## What the Plugin Already Does Right

1. **Properly loads BMAD workflows** — It uses the 5-step loader pattern with `workflow.xml` + specific `workflow.yaml` configs, exactly as BMAD intends.
2. **Doesn't reinvent BMAD** — It orchestrates BMAD workflows (`create-story`, `dev-story`, `code-review`) rather than replacing them.
3. **Adds what BMAD can't** — GitHub issue sync, worktree parallelism, auto-commit per task, PR creation with `Closes #N`, label management, sprint-status reconciliation.

---

## Enhancement Opportunities

Here's where you *could* better fit into the BMAD ecosystem without restarting:

### 1. Create a Companion BMAD Extension Module (Low effort, High alignment)

Package a lightweight BMAD extension module that slots into BMM's implementation phase via `module-help.csv`. This would make the GitHub workflows **discoverable through `bmad help`** — users browsing BMAD's help system would find them.

```yaml
# module.yaml
code: bmad-github
name: "GitHub Story Workflow"
version: "0.1.0"
extends-module: bmm
description: "GitHub + git worktree orchestration for BMAD stories"
```

The actual *execution* still happens via the Claude Code plugin, but discovery happens through BMAD's native system.

### 2. Respect BMAD Global Config

BMAD has a [global config system](https://bmad-builder-docs.bmad-method.org/reference/global-config/) that modules inherit. The plugin hardcodes paths like `_bmad-output/implementation-artifacts/` — reading these from BMAD's config would make the plugin portable across different BMAD setups.

### 3. Contribute Story Lifecycle Patterns Back to BMM

The init -> create -> dev -> review -> sync lifecycle is a genuinely useful abstraction. The workflow patterns (e.g., dependency analysis in `/story-create`, auto-commit layer in `/story-dev`) could become BMAD workflow templates that other BMAD users benefit from — even without GitHub.

### 4. Use BMAD's `install` Config Pattern

Instead of `.claude/bmad-github.local.md` with YAML frontmatter, you could also support BMAD's `install` question pattern for initial setup:

```yaml
install:
  - question: "Where should worktrees be created?"
    config_key: "worktree_root"
    options:
      - "../{repo-name}-worktrees"
      - "custom path"
```

This would matter if you ever publish the module to BMAD's marketplace.

---

## Summary

| Question | Answer |
|----------|--------|
| Restart? | **No** — architecturally sound, fills a real gap |
| Repackage as BMAD module instead? | **No** — BMAD modules can't do what this plugin does (bash, gh, git) |
| Create companion BMAD extension? | **Yes** — for discoverability in `bmad help` |
| Read BMAD global config? | **Yes** — makes plugin portable |
| Contribute patterns back? | **Optional** — good for the ecosystem |

The plugin is a **Claude Code orchestration layer on top of BMAD workflows**, and that's exactly the right architecture. The enhancements are about making it a better citizen in both ecosystems, not about replacing one with the other.

---

## Enhancement Plan (Incremental)

Work in two phases: **A (Portability + Robustness)** first, then **B (Ecosystem Fit)**.

### Phase A: Portability + Robustness

#### A1. Dynamic BMAD Path Resolution

`_bmad-output` is hardcoded 37 times across 7 files. BMAD's global config exposes `output_folder` (default: `_bmad-output`).

- [x] **Script:** In `sync-stories-to-github.mjs`, added `resolveBmadOutputFolder()` that reads `_bmad/bmm/config.yaml` and resolves `output_folder`. Falls back to `_bmad-output`.
- [x] **Commands:** Replaced all hardcoded `_bmad-output` references with `<output_folder>` in all 5 command files. Resolution instructions moved to a SessionStart hook (`hooks/scripts/session-start.sh`) to avoid repetition.
- [x] **Tests:** 6 new tests covering default fallback, config reading, `{project-root}` interpolation, quoted values, missing key, and absolute paths.

#### A2. Force-Close Detection in `/story-sync`

Currently, `/story-sync` treats all closed GitHub issues the same. A manually closed issue (no merged PR) triggers `done` + worktree cleanup, potentially losing work.

- [x] When a closed issue is detected, query for merged PRs: `gh pr list --search "<issue>" --state merged`
- [x] If merged PR exists → proceed normally (mark done, cleanup)
- [x] If no merged PR → warn the user, skip auto-cleanup, leave status unchanged
- [ ] Add tests for both code paths (N/A — this is a command file change, not script logic; tested via manual invocation)

#### A3. PR Description Update on Re-Review

`/story-review` commits fixes but doesn't update the PR description. Reviewers see stale info.

- [ ] After committing review fixes, regenerate the PR body's change summary using `git diff --stat main...HEAD`
- [ ] Update the PR via `gh pr edit <number> --body <updated-body>`
- [ ] Add a PR comment noting review fixes were applied

### Phase B: Ecosystem Fit

#### B1. Companion BMAD Extension Module

Make the plugin's workflows discoverable through `bmad help`.

- [ ] Create `bmad-github-module/src/module.yaml` with `extends-module: bmm`, targeting phase-4 (implementation)
- [ ] Create `bmad-github-module/src/module-help.csv` with 5 entries (init, create, dev, review, sync) — 13 columns per the BMAD spec
- [ ] Document that execution requires the Claude Code plugin; the module provides discoverability only

#### B2. BMAD Install Question Pattern

Support BMAD's `npx bmad-method install` flow alongside the existing `.local.md` config.

- [ ] Add `install` questions to `module.yaml` for `worktree_root` and other configurable values
- [ ] Update commands to read both BMAD install config AND `.claude/bmad-github.local.md`, with `.local.md` taking precedence (backward compatibility)

#### B3. Contribute Story Lifecycle Patterns to BMM

Extract GitHub-independent workflow patterns as reusable BMAD workflow templates.

- [ ] **Dependency analysis template** — Extract the logic from `/story-create` that detects code-level dependencies between stories (shared types, APIs, packages). Package as a reusable workflow step for BMM's `create-story` workflow.
- [ ] **Auto-commit layer template** — Extract the pattern from `/story-dev` where each completed task checkbox triggers a conventional commit. Useful for any CI/CD pipeline, not just GitHub PRs.
- [ ] **Human quality gate template** — Extract the pattern from `/story-review` where review fixes are committed but status never advances to `done` without human action. Encodes the principle that AI-generated code requires human sign-off.
- [ ] Package as BMAD workflow YAML files with GitHub-specific parts as optional extension points