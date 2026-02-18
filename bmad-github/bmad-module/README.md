# bmad-github BMAD Companion Module

This is a companion BMAD extension module that makes the bmad-github plugin's story lifecycle
workflows discoverable through `bmad help`.

## What This Module Does

It registers 5 workflows in BMAD's help system under phase-4 (implementation):

| Code | Name | Description |
|------|------|-------------|
| SI | Story Init | Batch sync BMAD epics to GitHub |
| SC | Story Create | Plan a story with BMAD + GitHub sync |
| SD | Story Dev | Implement a story with worktree + PR |
| SR | Story Review | Adversarial code review |
| SS | Story Sync | Reconcile GitHub state with BMAD files |

## What This Module Does NOT Do

It does **not** execute anything. The actual workflow execution requires the
[bmad-github Claude Code plugin](../). This module provides discoverability only —
users browsing `bmad help` will find the workflows and know to use the Claude Code
plugin to run them.

## Workflow Extension Templates

The module also includes 3 reusable workflow extension templates in `src/workflow-extensions/`.
These extract GitHub-independent patterns from the plugin as BMAD workflow steps that any
BMAD user can adopt — even without GitHub:

| Extension | Extends | Pattern |
|-----------|---------|---------|
| `dependency-analysis` | `create-story` | Detects code-level dependencies between stories (shared types, APIs, packages) to maximize parallel development |
| `auto-commit-layer` | `dev-story` | Creates granular conventional commits per task instead of one large commit per story |
| `human-quality-gate` | `code-review` | Prevents AI from marking stories as `done` — requires human approval via an external process |

Each extension has a `workflow.yaml` (metadata) and `instructions.md` (the procedure).
GitHub-specific features (PR creation, issue labels, etc.) are noted as optional extension
points, keeping the core templates platform-agnostic.

## Installation

```bash
npx bmad-method install
# Choose "Modify BMad Installation"
# When asked about custom content, provide the path to this directory
```
