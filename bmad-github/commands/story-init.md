---
name: 'story-init'
description: 'Batch sync BMAD epics to GitHub — creates milestones, labels, and issues from epics.md'
---

# Story Init: Batch Sync BMAD Epics → GitHub

You are running the initial (or re-sync) batch operation that creates GitHub Milestones, Labels, and Issues from the BMAD `epics.md` file.

This is **idempotent** — safe to re-run. It checks for existing milestones/issues before creating new ones.

**IMPORTANT:** This command MUST be run from the main repo directory (not a worktree).

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
   - `<output_folder>/planning-artifacts/epics.md` — the source of truth for epics and stories
   - `<output_folder>/implementation-artifacts/sprint-status.yaml` — tracks story statuses

   If either file is missing, STOP and tell the user which file is needed.

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
node ${CLAUDE_PLUGIN_ROOT}/scripts/sync-stories-to-github.mjs $ARGUMENTS
```

The script will:
- Parse `epics.md` to extract all epics and stories
- Create GitHub Milestones for each epic (if they don't exist)
- Create GitHub Labels (type labels per story + `status:*` status labels)
- Create GitHub Issues for each story (if they don't exist)
- Save the issue map to `<output_folder>/implementation-artifacts/github-issue-map.json`

Watch the output for any errors.

---

## Phase 2: Commit the Issue Map

If the script ran successfully (not `--dry-run`):

1. **Stage the issue map:**
   ```
   git add <output_folder>/implementation-artifacts/github-issue-map.json
   ```

2. **Check if there are changes to commit:**
   ```
   git status --porcelain <output_folder>/implementation-artifacts/github-issue-map.json
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
Map:        <output_folder>/implementation-artifacts/github-issue-map.json

Next steps:
  1. Run /story-create to pick a story and start development
  2. Run /story-sync to reconcile GitHub state with BMAD files
```

If `--dry-run` was used, remind the user that no changes were made.
