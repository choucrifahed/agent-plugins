---
name: bmad-github-story-init
description: 'Batch sync BMAD epics to GitHub: creates milestones, labels, and issues from epics.md. Idempotent: safe to re-run when epics change. Use when the user invokes the SI menu code in bmad help, or asks to bootstrap GitHub from epics, or asks to sync BMAD epics to GitHub.'
---

# Story Init: Batch Sync BMAD Epics → GitHub

You are running the initial (or re-sync) batch operation that creates GitHub Milestones, Labels, and Issues from the BMAD `epics.md` file.

This is **idempotent** — safe to re-run. It checks for existing milestones/issues before creating new ones.

**IMPORTANT:** This skill MUST be run from the main repo directory (not a worktree).

---

## On Activation

### Load Config

1. Set `{project-root}` to the output of `git rev-parse --show-toplevel`.
2. Run:
   ```
   uv run {project-root}/_bmad/scripts/resolve_config.py --project-root {project-root} --key modules.bmm.planning_artifacts --key modules.bmm.implementation_artifacts
   ```
3. Resolve `{planning_artifacts}` and `{implementation_artifacts}` from the JSON output. They are
   `{project-root}`-prefixed paths; resolve them against `{project-root}`.
4. If the command fails (including `uv` being unavailable), report its output and HALT:
   ```
   bmad-github needs BMad v6.12+ and uv. Install uv (https://docs.astral.sh/uv/), then run `npx bmad-method install`.
   ```
   If either key is missing, HALT and tell the user to install the BMad Method module (`bmm`).

---

## Pre-flight Checks

1. **Verify `gh` CLI is authenticated:**
   ```
   gh auth status
   ```
   If not authenticated, STOP and tell the user to run `gh auth login` first.

2. **Verify you are in the main repo** (not a worktree):
   ```
   git rev-parse --show-toplevel
   ```
   Confirm the path matches the main repo root.

3. **Verify BMAD files exist:**
   - `{planning_artifacts}/epics.md` — **required** — the source of truth for epics and stories
   - `{implementation_artifacts}/sprint-status.yaml` — **recommended** — written by `bmad-sprint-planning`; stories
     already at status `done` get their GitHub issues pre-closed during sync

   If `epics.md` is missing, HALT and tell the user to invoke the `bmad-create-epics-and-stories` skill first. If its
   frontmatter has `status: draft`, BMad has not finished validating it: warn the user and ask whether to continue.
   HALT and wait for the answer. If `sprint-status.yaml` is missing, warn that BMad expects the `bmad-sprint-planning`
   skill to run before implementation (Story Build requires it), then continue: the sync script skips done-story
   detection.

4. **Verify you are on the `main` branch:**
   ```
   git branch --show-current
   ```
   If not on `main`, warn the user and ask if they want to proceed.

5. **Pull latest from remote:**
   ```
   git pull --rebase
   ```

---

## Phase 1: Run the Sync Script

Run the batch sync script, passing through any arguments the user provided (e.g., `--dry-run`):

```
node {skill-root}/scripts/sync-stories-to-github.mjs $ARGUMENTS
```

`{skill-root}` is this skill's own directory. The script reads the same BMad config through
`_bmad/scripts/resolve_config.py`, so run it from `{project-root}`.

The script will:
- Parse `epics.md` to extract all epics and stories
- Create GitHub Milestones for each epic (if they don't exist)
- Create GitHub Labels (type labels per story + `status:*` status labels)
- Create GitHub Issues for each story (if they don't exist)
- Save the issue map to `{implementation_artifacts}/github-issue-map.json`

Watch the output for any errors.

---

## Phase 2: Commit the Issue Map

If the script ran successfully (not `--dry-run`):

1. **Stage the issue map:**
   ```
   git add {implementation_artifacts}/github-issue-map.json
   ```

2. **Check if there are changes to commit:**
   ```
   git status --porcelain {implementation_artifacts}/github-issue-map.json
   ```

3. **If there are changes, commit and push:**
   ```
   git commit -m "chore(bmad): sync GitHub issue map from epics"
   git push
   ```

---

## Phase 3: Report

Print a summary:

```
=== Story Init Complete ===

Milestones: <count> epics synced
Issues:     <count> stories synced
Map:        {implementation_artifacts}/github-issue-map.json

Next steps:
  1. Optional: run Story Setup CI (SCI) to mark stories done automatically when their PR merges
  2. Run Story Build (SB) to build the next story
```

If `--dry-run` was used, remind the user that no changes were made.
