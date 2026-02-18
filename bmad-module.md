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