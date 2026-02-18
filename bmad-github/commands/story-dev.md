---
name: 'story-dev'
description: 'Sync, verify story, create worktree/branch, run BMAD dev-story workflow with auto-commits per task and PR creation'
---

# Story Dev: Sync + Verify + Git Setup + BMAD Dev-Story + PR

You are developing a story. This command handles the full lifecycle:
1. Sync GitHub state (catch up on merged PRs)
2. Verify the story file is committed
3. Set up git worktree and branch
4. Run the BMAD dev-story workflow with auto-commits
5. Create a PR when development is complete

**IMPORTANT:** This command MUST be run from the main repo directory (not a worktree).

---

## Phase 0: Sync First

Read and follow `${CLAUDE_PLUGIN_ROOT}/references/sync-first.md`.

---

## Phase 1: Verify Story

1. **Determine the next story:**
   Read `<output_folder>/implementation-artifacts/sprint-status.yaml` and find the next story with status `ready-for-dev` (this is the BMAD status set by the create-story workflow).

   If no story has `ready-for-dev` status, STOP and tell the user:
   ```
   No story is ready for development. Run /story-create first to plan a story.
   ```

2. **Find the story file:**
   Look for a matching story file in `<output_folder>/implementation-artifacts/` using the story key.

   If the file doesn't exist, STOP and tell the user:
   ```
   Story file not found. Run /story-create first.
   ```

3. **Verify the story file is committed:**
   ```
   git status --porcelain <output_folder>/implementation-artifacts/
   ```
   If the story file or sprint-status.yaml has uncommitted changes, STOP and tell the user:
   ```
   Story file has uncommitted changes. Please commit and push first:
     git add <output_folder>/implementation-artifacts/
     git commit -m "chore(story): create story <story_id> - <story_key>"
     git push
   Then re-run /story-dev.
   ```

4. **Extract story metadata:**
   - Story key from the file name (e.g., `1-2-bridge-interface-and-shared-type-contracts`)
   - Story ID (e.g., `1-2`) — the numeric prefix of the key
   - Story title from the file content

5. **Check for blocking dependencies:**
   Look for a `### Blocked By` section in the story file. If found:
   - Extract the story keys listed in the section
   - Check their **current** status in `sprint-status.yaml` (statuses may have changed since `/story-create` ran)
   - If ALL listed stories are now `done`, continue — the dependencies have been completed
   - If any are still NOT `done`, STOP and tell the user:
     ```
     === Story Blocked ===

     Story <story_id> - <story_title> cannot start development.

     Required stories not yet completed:
       - <story_key> (status: <current_status>)

     Complete these stories first, then re-run /story-dev.
     ```

---

## Phase 2: Git Setup

### Step 1: Resolve Worktree Root

Read and follow `${CLAUDE_PLUGIN_ROOT}/references/resolve-worktree-root.md`.

### Step 2: Update status to in-progress

Look up the issue number from `<output_folder>/implementation-artifacts/github-issue-map.json` using the story ID.

**Update GitHub issue label:**
```
gh issue edit <number> --remove-label "status:backlog" --remove-label "status:ready" --add-label "status:in-progress"
```

**Update sprint-status.yaml locally:**
Edit `<output_folder>/implementation-artifacts/sprint-status.yaml` and change the story's status from `ready-for-dev` to `in-progress`.

### Step 3: Commit and push status update on main

Commit the local status change on the main branch **before** creating the worktree, so the worktree starts from a clean, up-to-date main:

```
git add <output_folder>/implementation-artifacts/sprint-status.yaml
git commit -m "chore(story): mark <story_id> in-progress"
git push
```

### Step 4: Create worktree with branch

First check if the worktree/branch already exists (from a previous interrupted run):

```
git worktree list
```

If a worktree for this story already exists, reuse it. Otherwise:

```
git worktree add <worktree-root>/story-<story_key> -b story/<story_key>
```

Example:
```
git worktree add <worktree-root>/story-1-2-bridge-interface-and-shared-type-contracts -b story/1-2-bridge-interface-and-shared-type-contracts
```

If the branch already exists but the worktree doesn't:
```
git worktree add <worktree-root>/story-<story_key> story/<story_key>
```

### Step 5: Report and switch

```
=== Worktree Ready ===

Story:     <story_id> - <story_title>
Branch:    story/<story_key>
Worktree:  <worktree-root>/story-<story_key>/
Issue:     #<number> — status:in-progress

Switching to worktree to continue development...
```

Change the working directory to the worktree:
```
cd <worktree-root>/story-<story_key>/
```

**Why a worktree:** Multiple agents can work simultaneously — each in its own worktree directory, on its own branch, without interfering with each other or the main repo.

---

## Phase 3: Run BMAD dev-story Workflow

Read and follow `${CLAUDE_PLUGIN_ROOT}/references/bmad-workflow-loader.md` with `<workflow-path>` = `_bmad/bmm/workflows/4-implementation/dev-story/workflow.yaml`.

### Auto-Commit Instruction (Layer on top of BMAD workflow)

**After each task is marked `[x]` in the story file and the story file is saved**, also run:

```
git add -A
git commit -m "feat(<story_id>): <brief task description>"
```

Example commit messages:
- `feat(1-2): define Bridge interface with file and theme methods`
- `feat(1-2): add ThemeTokens and CursorInfo types`
- `feat(1-2): create mock Bridge factory for test utilities`
- `test(1-2): add Bridge interface contract tests`

Use the appropriate conventional commit prefix:
- `feat` for new functionality
- `test` for test additions
- `fix` for bug fixes during development
- `refactor` for restructuring without behavior change
- `chore` for build/config changes

This creates **granular commits per task** — much better for PR review than a single large commit.

---

## Phase 4: Create PR (After All Tasks Complete)

After the BMAD workflow completes and the story status is `review`:

### Step 1: Push the branch
```
git push -u origin story/<story_key>
```

### Step 2: Look up the GitHub issue number
Read `<output_folder>/implementation-artifacts/github-issue-map.json` and find the entry for this story's ID (e.g., `1-2`).

### Step 3: Build the label set

The PR and issue should end up with the **same labels** (except `status:*` labels, which only live on the issue).

**a) Fetch existing issue labels:**
```
gh issue view <issue_number> --json labels --jq '.labels[].name'
```
Filter out any labels starting with `status:` — these are managed separately.

**b) Detect file-based labels from the branch diff:**
```
git diff --name-only main...HEAD
```

Apply these rules to the list of changed files:
- `*.ts` or `*.tsx` → `typescript`
- `*.js` or `*.mjs` or `*.cjs` → `javascript`
- `*.css` or `*.scss` → `css`
- `*.html` → `html`
- `.github/**` → `github_actions`
- `*.md` (excluding `<output_folder>/**`) → `documentation`
- `package.json` or `pnpm-lock.yaml` changes → `dependencies`
- `*.test.ts` or `*.test.js` or `__tests__/**` → `qa`

**c) Merge:** Combine existing issue labels (minus `status:*`) with the file-based detected labels into a single unique set. This is the **shared label set** used for both the PR and the issue.

### Step 4: Create the PR
```
gh pr create \
  --title "Story <story_id>: <story_title>" \
  --label "<comma-separated shared label set>" \
  --body "Closes #<issue_number>

## User Story
<from story file>

## Changes
<summarize the implementation from the story file's task list and File List section>

## Test Coverage
<summarize tests written>

---
_Developed via BMAD workflow_"
```

The `Closes #<issue_number>` in the PR body means **merging the PR will auto-close the GitHub issue**.

### Step 5: Sync labels to the issue

Ensure the issue has the same shared label set (adds any new file-based labels that weren't on the issue yet):
```
gh issue edit <issue_number> --add-label "<comma-separated shared label set>"
```

### Step 6: Update GitHub issue status label
```
gh issue edit <issue_number> --remove-label "status:in-progress" --add-label "status:review"
```

### Step 7: Report

```
=== Story Development Complete ===

Story:   <story_id> - <story_title>
Branch:  story/<story_key>
PR:      <pr_url>
Issue:   #<issue_number>
Status:  review
Labels:  <shared label set>

Commits: <count> commits created during development

Next steps:
  1. Run /story-review in this worktree for code review
  2. Or, the user can review the PR directly on GitHub
```
