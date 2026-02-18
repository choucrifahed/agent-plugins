# Auto-Commit Layer — Post-Task-Completion Step

After each task is marked `[x]` in the story file and the story file is saved, create a granular version control commit capturing that task's changes.

## Commit Trigger

The commit happens **after** the dev-story workflow's step 8 (task validation and marking complete). The sequence is:

1. Dev-story workflow validates the task (tests pass, acceptance criteria met)
2. Dev-story workflow marks the task `[x]` and saves the story file
3. **This extension:** stage all changes and create a commit

## Commit Format

Use [Conventional Commits](https://www.conventionalcommits.org/) with the story ID as scope:

```
<type>(<story-id>): <brief task description>
```

### Commit Type Selection

Choose the appropriate prefix based on the task's nature:

| Type | When to Use |
|------|-------------|
| `feat` | New functionality, features, interfaces, types |
| `test` | Test additions or test-only changes |
| `fix` | Bug fixes discovered during development |
| `refactor` | Restructuring without behavior change |
| `chore` | Build, config, or tooling changes |
| `docs` | Documentation-only changes |

### Examples

```
feat(1-2): define Bridge interface with file and theme methods
feat(1-2): add ThemeTokens and CursorInfo types
test(1-2): add Bridge interface contract tests
fix(1-2): handle null theme tokens in Bridge adapter
refactor(1-2): extract shared validation into utility
chore(1-2): configure TypeScript paths for new package
```

## Staging Strategy

Stage all changes related to the completed task:

```
git add -A
git commit -m "<type>(<story-id>): <brief task description>"
```

If the task produced changes across multiple files, they all belong in the same commit — one commit per task, not per file.

## Benefits

- **Better PR review:** Reviewers see the logical progression of the implementation
- **Easier bisection:** `git bisect` can identify which task introduced a regression
- **Clear history:** Each commit message maps directly to a story task
- **Incremental progress:** Partial work is preserved even if the session is interrupted

## Extension Points

**Branch management (optional):**
The orchestration layer may create a dedicated branch before development starts and push commits to a remote. This is VCS-platform-specific and should be implemented by the orchestration layer.

**PR creation (optional):**
After all tasks are complete, the orchestration layer may create a pull/merge request from the accumulated commits. This is platform-specific (GitHub, GitLab, etc.) and should be implemented by the orchestration layer.
