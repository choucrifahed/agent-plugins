# Sync First

Reconcile local state with GitHub before the next skill runs. **This matters for correctness**, not just freshness: BMAD's own workflows (`create-story`, `dev-story`, `retrospective`, etc.) read `sprint-status.yaml` from disk to decide what story is next, check epic state, and detect completed epics. If the file is stale because a PR merged without anyone running `/story-sync` (or CI hasn't fired yet), BMAD will pick the wrong next story, halt on a story it thinks is still in-progress, or miss a completed epic.

GitHub issue `status:*` labels are the source of truth for cross-agent coordination, but they don't substitute for keeping `sprint-status.yaml` honest — that's what BMAD reads.

## Behavior

1. **Detect the current branch:**
   ```
   git branch --show-current
   ```

### Case A — on the main branch

Run the full `/story-sync` reconciliation logic before proceeding. This catches up `sprint-status.yaml`, story files, GitHub labels, and worktrees with whatever has happened on GitHub since the last sync:

1. `git pull --rebase` to pick up any CI- or peer-authored updates.
2. Read `<output_folder>/implementation-artifacts/github-issue-map.json` and `sprint-status.yaml`.
3. Query GitHub for each mapped issue's state.
4. For each issue that is CLOSED via a merged PR: update `sprint-status.yaml` (story → `done`), update the story file's `Status:` line, sync the GitHub label to `status:done`. If an issue was closed without a merged PR, warn the user and ask how to proceed (same prompt as `/story-sync` Phase 3).
5. Promote any epic whose stories are all `done`.
6. Clean up worktrees and branches for completed stories.
7. If any files changed, commit (`chore(sync): mark stories done from merged PRs`) and push.

This is the same logic as `/story-sync` Phases 2–7; the implementation lives there.

Then continue with the calling skill's next phase.

### Case B — in a worktree (any branch other than main)

Cannot run the full reconciliation: the writes happen on `main`, and we can't write to `main` from inside a linked worktree without checking it out (which would defeat the point of being in a worktree).

Do the most you safely can from here:

1. `git fetch origin` — refresh remote-tracking refs so any later branch operations see current state.
2. **Warn the user once:**
   ```
   ⚠ Running from worktree `<branch>`. Cannot reconcile sprint-status.yaml on main from here.
     If you suspect main is out of date (e.g., PRs were merged since this worktree was created),
     run `/story-sync` from the main repo first.
   ```
3. Continue with the calling skill's next phase. The cross-agent coordination signals this skill relies on (GitHub 
   `status:*` labels) are queried live, so they remain correct — only BMAD's view of `sprint-status.yaml` may be stale,
   and only with respect to merges that happened after this worktree was created.

## Cost note

The on-main case makes one GitHub API call per mapped issue (`gh issue view <n>`) plus per-PR verification. For a
project with dozens of issues this takes a few seconds. That cost is the price of running BMAD safely against stale
local state, and is unavoidable as long as BMAD reads from disk.
