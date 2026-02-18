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

## Installation

```bash
npx bmad-method install
# Choose "Modify BMad Installation"
# When asked about custom content, provide the path to this directory
```
