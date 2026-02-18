---
name: 'story-review'
description: 'Run BMAD adversarial code review, push fixes, but do NOT mark story as done. The user merges the PR on GitHub, then /story-sync marks it done.'
---

# Story Review: BMAD Code Review + Push (NO "done")

You are performing an adversarial code review on a story. This command runs the BMAD code-review workflow but **overrides the final status transition**: the story stays at `review`, NOT `done`.

**The "done" transition only happens via `/story-sync` after the user merges the PR on GitHub.** The user is the sole reviewer and merger of PRs — this is the quality gate.

**IMPORTANT:** This command MUST be run from the story's worktree directory (created by `/story-create`), NOT from the main repo.

---

## Pre-flight Checks

1. **Detect the story context from the current worktree:**
   ```
   git branch --show-current
   ```
   The branch name should be `story/<story_key>`.
   Extract the story key and story ID from the branch name.

   If the branch doesn't match the `story/` pattern, STOP and tell the user this command must be run from a story worktree.

2. **Find the story file** in `<output_folder>/implementation-artifacts/` matching the story key.

3. **Verify a PR exists for this branch:**
   ```
   gh pr view --json number,url,state
   ```
   If no PR exists, tell the user to run `/story-dev` first.

---

## Phase 1: Run BMAD code-review Workflow

Read and follow `${CLAUDE_PLUGIN_ROOT}/references/bmad-workflow-loader.md` with `<workflow-path>` = `_bmad/bmm/workflows/4-implementation/code-review/workflow.yaml`.

### CRITICAL OVERRIDE: Do NOT Set Status to "done"

When the BMAD code-review workflow reaches its final step where it would normally set the story status to `done`:

**DO NOT change the story status to `done`.** Keep it at `review`.

The reason: The "done" transition is controlled by the GitHub PR merge flow:
1. User reviews the PR on GitHub
2. User merges the PR (which auto-closes the GitHub issue via `Closes #N`)
3. User runs `/story-sync` which detects the closed issue and marks BMAD as done

This ensures the **user is the quality gate** — no story is marked done without human review and approval.

---

## Phase 2: Git Automation

### If Code Changes Were Made (Fixes Applied)

The BMAD review may identify issues and apply fixes. If any code changes were made:

```
git add -A
git commit -m "fix(<story_id>): address code review findings"
git push
```

If there were multiple rounds of fixes, each round should be a separate commit:
```
git add -A
git commit -m "fix(<story_id>): <specific fix description>"
```

Push all commits at the end:
```
git push
```

### Update PR Description

After pushing review fixes, update the PR so reviewers see the current state:

1. **Regenerate the change summary** from the full branch diff:
   ```
   git diff --stat main...HEAD
   ```

2. **Read the current PR body:**
   ```
   gh pr view --json body --jq '.body'
   ```

3. **Update the PR body** — replace the `## Changes` section with the updated diff stat. Keep all other sections (User Story, Test Coverage, etc.) unchanged:
   ```
   gh pr edit <number> --body "<updated body>"
   ```

4. **Add a PR comment** summarizing what the review found and fixed:
   ```
   gh pr comment <number> --body "## Code Review Fixes

   Applied fixes from BMAD adversarial code review:
   <brief list of what was changed>

   ---
   _Reviewed via BMAD workflow_"
   ```

### Report Based on Review Outcome

**If all issues are resolved** (BMAD review passed — story would have been marked "done"):

Print:
```
=== Code Review Complete ===

Story:   <story_id> - <story_title>
Branch:  story/<story_key>
PR:      <pr_url>
Result:  PASSED - Ready for your review

All review findings have been addressed.
The story status remains at 'review' (not 'done').

Next steps:
  1. Review the PR on GitHub: <pr_url>
  2. Merge when satisfied (this auto-closes issue #<number>)
  3. Run /story-sync from the main repo to update BMAD files and clean up
```

**If action items remain** (status stays at `in-progress`):

Print:
```
=== Code Review Incomplete ===

Story:   <story_id> - <story_title>
Branch:  story/<story_key>
Result:  ACTION ITEMS REMAIN

Fixes applied so far have been pushed.
Remaining issues need implementation work.

Next steps:
  1. Run /story-dev in this worktree to address remaining items
  2. Run /story-review again after development is complete
```
