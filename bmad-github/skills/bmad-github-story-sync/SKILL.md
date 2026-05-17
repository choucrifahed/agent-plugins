---
name: bmad-github-story-sync
description: 'Reconcile GitHub state with BMAD files — detect merged PRs, mark stories done in sprint-status.yaml and story files, sync GitHub labels, and clean up worktrees and branches. Use when the user invokes the SS menu code in bmad help, or asks to sync BMAD with GitHub, or just merged a PR and wants BMAD updated.'
---

# Story Sync: Reconcile GitHub State → BMAD Files (on main) + Local Worktree Cleanup

This skill brings `sprint-status.yaml` and story files on `main` into agreement with GitHub issue state, and cleans up 
local worktrees/branches for stories whose PRs have merged.

**GitHub issue `status:*` labels are the authoritative store** for cross-agent coordination. `sprint-status.yaml` is 
BMAD's own tracker — other BMAD workflows (and other plugins) read it. This skill keeps it current as a courtesy to BMAD.

**Writes happen on `main`** (this skill is always run from `main`, so writes/commits there are not a coordination 
problem and do not block parallel agents working in worktrees).

The `bmad-story-sync` GitHub Actions workflow (installed via `/story-setup-ci`) performs the same writes automatically 
on every PR merge. Both writers are idempotent — if both run, the second is a no-op. If a user hasn't installed the CI 
workflow (or it failed), running `/story-sync` is the reliable manual path.

**IMPORTANT:** This skill MUST be run from the main repo directory, on `main`.

---

## Pre-flight Checks

1. **Verify you are in the main repo** (not a worktree):
   ```
   git rev-parse --show-toplevel
   git rev-parse --git-common-dir
   git rev-parse --git-dir
   ```
   If `--git-dir` differs from `--git-common-dir`, you're in a linked worktree. STOP and tell the user to run this from 
   the main repo directory.

2. **Verify you are on `main`:**
   ```
   git branch --show-current
   ```
   If not on `main`, warn the user and ask if they want to proceed.

3. **Pull latest** (brings in any CI-authored sprint-status.yaml updates):
   ```
   git pull --rebase
   ```

4. **Verify `gh` CLI is authenticated:**
   ```
   gh auth status
   ```

---

## Phase 1: Resolve Worktree Root

Read and follow `${CLAUDE_PLUGIN_ROOT}/references/resolve-worktree-root.md`.

---

## Phase 2: Read Current State

1. **Read the GitHub issue map:**
   Read `<output_folder>/implementation-artifacts/github-issue-map.json`
   - Maps story keys (e.g., `"1-2"`) to GitHub issue numbers and URLs.
   - If the file doesn't exist, STOP and tell the user to run Story Init (SI) first.

2. **Read `sprint-status.yaml`:**
   Read `<output_folder>/implementation-artifacts/sprint-status.yaml`
   - Parse current BMAD status for each story key.
   - If the file doesn't exist, BMAD hasn't been sprint-planned yet. Continue, but skip the sprint-status.yaml writes in
     Phase 4 — there's nothing to update.

3. **Query GitHub for each mapped issue's state:**
   For each `(story_key, issue_number)` entry in the map:
   ```
   gh issue view <number> --json number,state,labels,stateReason,closedAt
   ```
   Collect issues where `state == "CLOSED"`.

---

## Phase 3: Verify Merge for Each Closed Issue

For each closed issue, check whether it was closed by a merged PR:

```
gh pr list --search "<issue_number> in:body" --state merged --json number,title --limit 5
```

- **If a merged PR exists** → add this story to the "to-sync" set; record `merged_pr_number`.
- **If NO merged PR exists** → the issue was closed without a merge. Warn the user and ask:
  ```
  ⚠ Issue #<number> (story <key>) was closed without a merged PR.

  How would you like to handle this?
    1. Skip — leave everything as-is (issue may have been closed accidentally)
    2. Mark as done — the story was intentionally completed or abandoned
    3. Re-open — re-open the issue on GitHub and skip
  ```
  - **Skip** → do not include this story in the "to-sync" set.
  - **Mark as done** → include this story in the "to-sync" set; record `merged_pr_number = null`.
  - **Re-open** → run `gh issue reopen <number>`, skip.

---

## Phase 4: Sync Each Completed Story → `done`

For each story in the "to-sync" set, perform these writes **on `main`** (where the skill is running):

### Step 1: Update `sprint-status.yaml`

If `sprint-status.yaml` exists:
- Find the line whose key matches `<story_key>` (allow for the full key suffix, e.g., `1-2-bridge-interface-...`).
- Change its value to `done`.
- Update the `last_updated` field to today's date (preserve YAML structure and comments).

Idempotency: if the line is already `done`, skip the write (no-op).

### Step 2: Update the story file's `Status:` line

Glob `<output_folder>/implementation-artifacts/<story_key>-*.md` (e.g., `1-4-*.md`).
- If a match is found, replace the line beginning with `Status:` (typically near the top) with `Status: done`.
- If no story file exists, skip silently (the story may have been imported from epics without a file).

Idempotency: if already `Status: done`, skip.

### Step 3: Update GitHub issue labels

```
gh issue edit <number> \
  --remove-label "status:backlog" \
  --remove-label "status:ready" \
  --remove-label "status:in-progress" \
  --remove-label "status:review" \
  --add-label "status:done"
```

Idempotent. If CI already set `status:done`, this is a no-op.

### Step 4: Record per-story result

For the final report, remember: story key, issue number, merged PR number (or "manual-close"), whether each write was 
applied or skipped (idempotent no-op).

---

## Phase 5: Check Epic Completion

For each epic whose milestone number appears in the issue map:

1. Collect all story keys in the map starting with `<epic_num>-`.
2. Check their current status in `sprint-status.yaml` (after Phase 4's writes).
3. If **all** stories in the epic are `done`, find the `epic-<N>:` line in `sprint-status.yaml` and update it to `done`. 
   If already `done`, no-op.

CI does the same check independently. Both running is fine.

---

## Phase 6: Clean Up Worktrees and Branches

1. **List all worktrees:**
   ```
   git worktree list
   ```

2. **For each worktree whose path matches `story-<key>`** AND `<key>` is in the "to-sync" set:

   ```
   git worktree remove <worktree-root>/story-<key>
   ```

   If the worktree has uncommitted changes, **do NOT force-remove**. Report and skip:
   ```
   ⚠ Worktree <path> has uncommitted changes — skipped. Inspect and remove manually if intentional.
   ```

3. **Delete the remote branch** (likely already deleted by PR merge; ignore errors):
   ```
   git push origin --delete story/<key> 2>/dev/null || true
   ```

4. **Delete the local branch** (ignore errors):
   ```
   git branch -d story/<key> 2>/dev/null || true
   ```

---

## Phase 7: Commit and Push BMAD File Updates

If Phase 4 or Phase 5 modified `sprint-status.yaml` or any story file:

```
git add <output_folder>/implementation-artifacts/sprint-status.yaml
git add <output_folder>/implementation-artifacts/*.md
git status --porcelain <output_folder>/implementation-artifacts/
```

If there are staged changes:
```
git commit -m "chore(sync): mark stories done from merged PRs"
git push
```

If there are no staged changes (everything was idempotent no-ops because CI had already written), skip the commit.

---

## Phase 8: Report

Print a summary:

```
=== Story Sync Complete ===

Completed stories synced: <count>
  - <story_key>  → done   (issue #<n>, PR #<pr_number_or_'manual-close'>)
  - ...

BMAD file writes:
  - sprint-status.yaml: <N updated / 0 — already current>
  - story files:        <N updated / 0 — already current>
  - epics promoted to done: <N / 0>

GitHub label sync: <N updated / 0 — already current>

Cleanup performed:
  - <count> worktrees removed
  - <count> local branches deleted
  - <count> remote branches deleted

Skipped (uncommitted changes):
  - <path>  (if any)

Pending user decision:
  - Issue #<n> closed without merged PR (if any)

Commit: <"chore(sync): mark stories done from merged PRs" pushed | nothing to commit>
```

If nothing was found to sync or clean up, print:
```
=== Story Sync Complete ===

Everything is up to date — no stories needed syncing, no worktrees needed cleanup.
```
