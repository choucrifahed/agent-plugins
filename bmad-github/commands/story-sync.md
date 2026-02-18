---
name: 'story-sync'
description: 'Reconcile GitHub state with BMAD files - detects merged PRs, marks stories done, cleans up worktrees and branches'
---

# Story Sync: Reconcile GitHub State → BMAD Files

You are performing a sync operation that makes BMAD files reflect the current state of GitHub Issues.
**GitHub Issues are the source of truth for story completion.** This command detects merged PRs (which auto-close issues) and propagates that status back to BMAD.

**IMPORTANT:** This command MUST be run from the main repo directory (not a worktree).

## Resolve Worktree Root

Determine where worktrees are stored for this project:

1. **Check for a local config override:**
   Read `.claude/bmad-github.local.md` if it exists. Look for a `worktree-root` field in the YAML frontmatter.

2. **If no override found, auto-detect:**
   ```
   basename $(git rev-parse --show-toplevel)
   ```
   The default worktree root is `../<repo-name>-worktrees/` relative to the repo root.

Store the resolved path as `<worktree-root>` for use in Phase 3 below.

3. **Persist the config if it doesn't exist:**
   If `.claude/bmad-github.local.md` did NOT already exist, create it now with the resolved worktree root so future runs (and `/story-dev`) skip auto-detection:
   ```markdown
   ---
   worktree-root: <worktree-root>
   ---
   ```

## Pre-flight Checks

1. **Verify you are in the main repo** (not a worktree):
   ```
   git rev-parse --show-toplevel
   ```
   Confirm the path matches the main repo root. If you're in a worktree, STOP and tell the user to run this from the main repo directory.

2. **Verify you are on the `main` branch:**
   ```
   git branch --show-current
   ```
   If not on `main`, warn the user and ask if they want to proceed.

3. **Pull latest from remote:**
   ```
   git pull --rebase
   ```

## Phase 1: Read Current State

1. **Read the GitHub issue map:**
   Read `_bmad-output/implementation-artifacts/github-issue-map.json`
   - This maps story keys (e.g., `"1-2"`) to GitHub issue numbers and URLs
   - If the file doesn't exist, tell the user to run `/story-init` first

2. **Read sprint-status.yaml:**
   Read `_bmad-output/implementation-artifacts/sprint-status.yaml`
   - Parse the current BMAD status for each story

3. **Query GitHub for each mapped issue's state:**
   For each entry in the issue map, run:
   ```
   gh issue view <number> --json state,labels,stateReason
   ```
   Collect which issues are closed (state: "CLOSED").

## Phase 2: Sync Closed Issues → BMAD "done"

For each story where **GitHub issue is CLOSED** but **BMAD status is NOT `done`**:

1. **Update sprint-status.yaml:**
   - Find the line matching this story's key pattern (e.g., `1-2-bridge-interface-and-shared-type-contracts`)
   - Change its status from whatever it currently is to `done`

2. **Update the story file** (if it exists in `_bmad-output/implementation-artifacts/`):
   - Glob for `_bmad-output/implementation-artifacts/<key>-*.md` (e.g., `1-4-*.md` for story key `1-4`)
   - If a matching file is found, find the line that starts with `Status:` near the top of the file (typically line 3) and change it to `Status: done`
   - Example: change `Status: review` to `Status: done`
   - **This step is REQUIRED** — do not skip it. Story files must stay in sync with sprint-status.yaml.

3. **Update GitHub issue labels:**
   ```
   gh issue edit <number> --remove-label "status:backlog" --remove-label "status:ready" --remove-label "status:in-progress" --remove-label "status:review" --add-label "status:done"
   ```

4. **Report:** Print "Synced story N.M → done (PR merged on GitHub)"

## Phase 3: Clean Up Worktrees for Completed Stories

1. **List all worktrees:**
   ```
   git worktree list
   ```

2. **For each worktree that matches a completed story** (path contains `story-<key>`):
   ```
   git worktree remove <worktree-root>/story-<key>-<slug>
   ```
   If the worktree has uncommitted changes, report the issue and skip (do NOT force remove).

3. **Clean up remote branch:**
   ```
   git push origin --delete story/<key>-<slug>
   ```
   Ignore errors (branch may already be deleted by PR merge).

4. **Clean up local branch:**
   ```
   git branch -d story/<key>-<slug>
   ```
   Ignore errors (branch may already be gone).

## Phase 4: Check Epic Completion

For each epic, check if ALL stories in that epic are `done` in sprint-status.yaml.
If so, update the epic status to `done` as well.

## Phase 5: Commit & Report

1. **If any BMAD files were updated**, commit the changes:
   ```
   git add _bmad-output/implementation-artifacts/sprint-status.yaml
   git add _bmad-output/implementation-artifacts/*.md
   git commit -m "chore(sync): mark stories done from merged PRs"
   git push
   ```

2. **Print a summary report:**
   - How many stories were synced to `done`
   - How many worktrees were cleaned up
   - Current sprint status overview (list each epic and its stories with statuses)
   - Any issues encountered (e.g., worktrees with uncommitted changes)

If no stories needed syncing, report "Everything is up to date."
