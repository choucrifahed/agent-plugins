---
name: bmad-github-story-create
description: "Deprecated: `bmad-github-story-build` (Story Build, SB) is now the official way to plan and build a story. Only use this when explicitly invoked by name"
metadata:
  lifecycle: shim
---

# Story Create (deprecated): Sync + BMAD `bmad-create-story`

> **Deprecated.** BMad v6.11 made `bmad-build` its official implementation flow: it plans and builds a story in one
> run. BMad deprecated `bmad-create-story` and `bmad-dev-story`. Use **Story Build (SB)** instead. This skill keeps
> working while BMad's deprecated `bmad-create-story` skill is installed, and goes away when BMad removes it in v7.

Start by printing:

```
Deprecated: Story Build (SB) is now the official way to plan and build a story. Story Create runs only while BMad's deprecated bmad-create-story skill is installed.
```

This skill syncs local state, then invokes BMAD's `bmad-create-story` to write a story file into
`{implementation_artifacts}` on the current branch, and marks the GitHub issue `status:ready`. Story Build (SB) picks up
that story file as its intent.

---

## On Activation

### Load Config

1. Set `{project-root}` to the output of `git rev-parse --show-toplevel`.
2. Run:
   ```
   uv run {project-root}/_bmad/scripts/resolve_config.py --project-root {project-root} --key modules.bmm.planning_artifacts --key modules.bmm.implementation_artifacts
   ```
   If `{project-root}/_bmad/scripts/resolve_config.py` does not exist in this checkout, run the same command with
   `--project-root` set to the main checkout: the parent directory of
   `git rev-parse --path-format=absolute --git-common-dir`.
3. Resolve `{planning_artifacts}` and `{implementation_artifacts}` from the JSON output. They are
   `{project-root}`-prefixed paths; resolve them against the current checkout.
4. If the command fails (including `uv` being unavailable), report its output and HALT:
   ```
   bmad-github needs BMad v6.12+ and uv. Install uv (https://docs.astral.sh/uv/), then run `npx bmad-method install`.
   ```
   If either key is missing, HALT and tell the user to install the BMad Method module (`bmm`).

---

## Phase 0: Sync First

Run `git branch --show-current`.

- **On `main`:** invoke the `bmad-github-story-sync` skill and let it finish, then continue here.
- **On any other branch:** run `git fetch origin` and warn that `sprint-status.yaml` may lag `main`. The new story file
  lands on this branch, and must reach `main` before another agent's worktree can see it.

---

## Phase 1: Create the Story with `bmad-create-story`

Invoke the `bmad-create-story` skill.

If `bmad-create-story` is not available, HALT:
```
BMad's bmad-create-story skill is not installed. BMad v6.12 deprecated it and leaves it out of fresh installs.
Use Story Build (SB), which plans and builds the story with bmad-build. To keep using Story Create until BMad v7,
re-run the BMad installer with --shims.
```

After it completes, note the **story ID** (e.g. `1-2`), the **story key** (file name without `.md`), the **story
title**, and the **story file path** in `{implementation_artifacts}`.

If it halts because `sprint-status.yaml` is missing, tell the user to invoke the `bmad-sprint-planning` skill first.

---

## Phase 1.5: Check for Blocking Dependencies

Only block on a genuine implementation dependency, never on numbering alone.

1. From `{implementation_artifacts}/github-issue-map.json`, collect the other stories of the same epic and read each
   issue's status label (`gh issue view <number> --json labels`). `status:done` stories are complete; the rest are
   candidates. If GitHub is unreachable, fall back to `sprint-status.yaml` and note the staleness.
2. For each candidate, decide whether this story needs code, types, APIs, or infrastructure the candidate produces.
3. If genuine dependencies exist and are not `status:done`, add a `### Blocked By` section at the start of the story
   file's `## Dev Notes`, listing each dependency's full key, current label, and a one-line reason.

---

## Phase 2: Status Update

1. Look up the issue number in `{implementation_artifacts}/github-issue-map.json` and run:
   ```
   gh issue edit <number> --remove-label "status:backlog" --add-label "status:ready"
   ```
2. Report:
   ```
   === Story Planned ===

   Story:   <story_id> - <story_title>
   File:    <story file path>
   Issue:   #<number> — status:ready
   Branch:  <current branch>

   Next steps:
     1. Review the story file, then commit and push it.
     2. If you are not on main, merge it to main before another agent builds it.
     3. Run Story Build (SB): it builds this story file with bmad-build.

   Story Create is deprecated: Story Build (SB) plans and builds the next story in one run.
   ```
