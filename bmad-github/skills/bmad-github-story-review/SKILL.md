---
name: bmad-github-story-review
description: 'Optional extra review of an open story PR: invokes bmad-code-review on the story branch, pushes fixes to the PR, and never marks the story done (merging the PR does). Use when the user invokes the SR menu code in bmad help, or asks for another code review of the current story or its PR.'
---

# Story Review (optional): `bmad-code-review` + Push (never "done")

Story Build (SB) already reviews every story: `bmad-build` runs independent reviewers and fixes what belongs to the
change before the PR opens. This skill is the **optional extra pass** BMad describes for `bmad-code-review`: a second
opinion on the open PR, for example after you addressed PR comments, or with a different model.

It invokes `bmad-code-review` but **overrides its final status transition**: the story stays at `review`, never
`done`. Plain `bmad-code-review` marks a clean story `done` in `sprint-status.yaml`, before any merge.

**The "done" transition only happens via Story Sync (SY) or the Story Sync CI workflow after the user merges the PR on
GitHub.** The user is the sole reviewer and merger of PRs — this is the quality gate.

**IMPORTANT:** Run this skill from the story's worktree (created by Story Build), not from the main checkout.

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

## Pre-flight Checks

1. **Detect the story context from the current worktree:**
   ```
   git branch --show-current
   ```
   The branch name should be `story/<story_key>`.
   Extract the story key and story ID from the branch name.

   If the branch doesn't match the `story/` pattern, STOP and tell the user this skill must be run from a story worktree.

2. **Find the story's record file** in `{implementation_artifacts}`: the `bmad-build` spec
   `spec-<story_id>-*.md`, or else a legacy story file `<story_id>-*.md`. Save it as `{record_file}`.

3. **Verify a PR exists for this branch:**
   ```
   gh pr view --json number,url,state
   ```
   If no PR exists, tell the user to run Story Build (SB) first.

---

## Phase 1: Review with `bmad-code-review`

Invoke the `bmad-code-review` skill. Tell it to review the PR for this branch, and pass `{record_file}` as the spec.

If `bmad-code-review` is not available, HALT and tell the user to install or update BMad (`npx bmad-method install`,
BMad Method module).

### CRITICAL OVERRIDE: Do NOT Set Status to "done"

When `bmad-code-review` reaches its final step, where it would set the story status to `done`:

**DO NOT change the story status to `done`.**
- In `sprint-status.yaml`, keep the story at `review`.
- In a legacy story file, keep `Status: review`.
- In a `bmad-build` spec, leave the frontmatter `status` as `bmad-build` set it.

The reason: The "done" transition is controlled by the GitHub PR merge flow:
1. User reviews the PR on GitHub
2. User merges the PR (which auto-closes the GitHub issue via `Closes #N`)
3. Story Sync (SY), or the Story Sync CI workflow, detects the closed issue and marks the story done

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

   Applied fixes from bmad-code-review:
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
  3. Run Story Sync (SY) from the main checkout to update BMAD files and clean up
```

**If action items remain:**

Print:
```
=== Code Review Incomplete ===

Story:   <story_id> - <story_title>
Branch:  story/<story_key>
Result:  ACTION ITEMS REMAIN

Fixes applied so far have been pushed.
Remaining issues need implementation work.

Next steps:
  1. Run Story Build (SB) in this worktree with the remaining findings as the intent,
     or fix them directly
  2. Run Story Review (SR) again if you want another pass
```
