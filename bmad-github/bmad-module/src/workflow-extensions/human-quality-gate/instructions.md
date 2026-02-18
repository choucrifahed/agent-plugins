# Human Quality Gate — Status Transition Override

Override the code-review workflow's final status transition. The story stays at `review` after AI review — it does **not** advance to `done`.

## The Principle

AI-generated code requires human sign-off. The standard BMAD code-review workflow sets the story to `done` after passing review. This extension changes that: the AI can review, find issues, and fix them, but only a human can mark the story as truly complete.

## Override Behavior

When the BMAD code-review workflow reaches its final step where it would normally set the story status to `done`:

**DO NOT change the story status to `done`.** Keep it at `review`.

The `review` status signals: "AI work is complete, awaiting human approval."

## Commit Review Fixes

If the code review identified issues and applied fixes:

1. Stage and commit the fixes with descriptive messages:
   ```
   fix(<story-id>): address code review findings
   ```

2. If there were multiple rounds of fixes, each round should be a separate commit with a specific description.

## Reporting

**If all review issues are resolved** (review would have passed):
Report that the story is ready for human review. The status remains at `review`.

**If action items remain** (review found issues that need more development):
Report the outstanding items. The status stays at `in-progress` or `review` depending on severity.

## The "Done" Transition

The `done` transition happens through an external, human-controlled process:

1. Human reviews the work (code, tests, documentation)
2. Human approves the work through their chosen mechanism
3. A reconciliation process detects the approval and marks BMAD status as `done`

This separation ensures the human is always the quality gate.

## Extension Points

**Approval mechanism (platform-specific):**
The actual human approval mechanism depends on the platform:
- **GitHub/GitLab:** PR merge auto-closes an issue; a sync command detects the closure
- **Manual:** Human directly edits sprint-status.yaml
- **CI/CD:** A deployment pipeline gate triggers the status update
- **Jira/Linear:** Issue status change triggers a webhook

The orchestration layer implements the specific approval detection. This template only enforces the invariant: AI cannot set `done`.

**PR description update (optional):**
After committing review fixes, the orchestration layer may update the PR/MR description so reviewers see the current state of changes. This is platform-specific.
