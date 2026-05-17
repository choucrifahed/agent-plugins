---
name: bmad-github-story-dev
description: 'Set up a git worktree/branch (or reuse the current one) and run BMAD dev-story end-to-end: auto-commits per task, PR creation, label updates. Use when the user invokes the SD menu code in bmad help, or asks to start implementing the next ready story, or asks to begin dev on a story.'
---

# Story Dev: Detect Context + Sync + Verify + Git Setup + BMAD Dev-Story + PR

You are developing a story. This skill handles the full lifecycle:

1. Detect the current working context (main checkout vs. existing story worktree)
2. Sync local state (light refresh)
3. Pick the target story (from branch name, user argument, or next `status:ready` GitHub issue)
4. Verify the story file is committed
5. Flip the GitHub issue status label atomically (acts as the cross-agent "lock")
6. Set up a git worktree/branch — or reuse the current one
7. Run the BMAD dev-story operation with auto-commits per task
8. Create a PR when development is complete

This skill is safe to run from `main` **or** from inside a `story/<key>` worktree. It does not require any commits on
`main` before branching, so it composes cleanly with orchestrators like Conductor that spawn agents in pre-created
worktrees.

---

## Phase 0: Detect Worktree Context

Run these together and record the results:

```
git rev-parse --is-inside-work-tree
git rev-parse --show-toplevel
git branch --show-current
```

Classify the context using the branch name as the primary signal:

| Branch name | Context | Worktree creation in Phase 5 |
|---|---|---|
| `main` (or the repo's main branch) | **main checkout** | Create a new worktree |
| `story/<key>` matching the plugin's convention | **existing story worktree** | Reuse — skip creation |
| any other branch | **unrecognized** | STOP and ask the user |

If the branch is unrecognized (not `main` and not `story/<key>`), print:
```
Current branch is `<branch>`. This skill expects either `main` or a `story/<key>` branch.
Switch to `main` (or to the story worktree you want to continue) and re-run.
```

Save the classification as `{{context}}` = `main` | `worktree` | `unrecognized` and the current branch as `{{branch}}`.

---

## Phase 1: Sync First

Read and follow `${CLAUDE_PLUGIN_ROOT}/references/sync-first.md`.

On `main` this runs the full `/story-sync` reconciliation so BMAD's `dev-story` (Phase 6) sees a current `sprint-status.yaml`. In a worktree, it does a `git fetch` and warns that `sprint-status.yaml` may lag `main`.

---

## Phase 2: Pick the Target Story

Determine the **story key** (e.g., `1-2-bridge-interface-and-shared-type-contracts`) and **story ID** (e.g., `1-2`, the numeric prefix) using whichever source applies:

### Case A — `{{context}}` is `worktree`

The story is already chosen: extract the story key from the current branch.
```
story_key = "<branch>" with the "story/" prefix removed
story_id  = leading "<N>-<M>" segments of story_key
```

### Case B — `{{context}}` is `main`

Pick a story to work on.

1. **If the user passed an explicit story key or ID** in their request (e.g., "dev 1-3" or "implement 1-3-user-prefs"), use that directly. Verify it exists in `<output_folder>/implementation-artifacts/github-issue-map.json`.

2. **Otherwise, pick the next ready story from GitHub:**
   ```
   gh issue list --label "status:ready" --state open --json number,title,labels,milestone --limit 50
   ```

   - If the list is empty, STOP and tell the user:
     ```
     No story has `status:ready` on GitHub. Run Story Create (SC) to plan one.
     ```
   - Pick the lowest story ID by parsing titles (BMAD story titles begin with the story ID).
   - Cross-reference with `github-issue-map.json` to recover the full story key from the chosen issue number.

Save the resolved `{{story_key}}`, `{{story_id}}`, and `{{issue_number}}`.

---

## Phase 3: Verify Story File

1. **Find the story file:**
   Glob `<output_folder>/implementation-artifacts/{{story_key}}.md` (and `{{story_id}}-*.md` as fallback).
   If no matching file exists, STOP:
   ```
   Story file not found for {{story_key}}. Start Story Create (SC) first.
   If the story was created in a different worktree, merge that branch into `main` (or pull the latest `main`) before running Story Dev.
   ```

2. **Verify the story file is committed** on the current branch:
   ```
   git status --porcelain <output_folder>/implementation-artifacts/
   ```
   If the story file is uncommitted, STOP and ask the user to commit it first.

3. **Read story metadata** from the file: story title, etc.

4. **Check blocking dependencies:**
   Look for a `### Blocked By` section in the story file. If present, extract the listed story keys, then for each one query its current status via GitHub:
   ```
   gh issue list --json number,title,labels --search "in:title <dep_story_id>" --limit 5
   ```
   Identify the matching issue (title prefix), then check its labels.

   - If all listed dependencies have `status:done`, continue.
   - Otherwise STOP:
     ```
     === Story Blocked ===

     Story {{story_id}} - {{story_title}} cannot start development.

     Required stories not yet done:
       - <dep_story_key> (current label: <dep_status>)

     Complete these stories first, then re-run Story Dev (SD).
     ```

---

## Phase 4: Claim the Story (Atomic GitHub Label Flip)

This single command serves as the cross-agent lock. If another agent already moved this story past `status:ready`, the 
`--remove-label` is a no-op (the label isn't there), and the `--add-label status:in-progress` is idempotent.

```
gh issue edit {{issue_number}} \
  --remove-label "status:backlog" \
  --remove-label "status:ready" \
  --add-label "status:in-progress"
```

The plugin does **not** edit `sprint-status.yaml` on `main` and does **not** push a status-update commit. BMAD's own 
`dev-story` workflow will write `sprint-status.yaml` from inside the worktree later (Step 4 of BMAD dev-story sets 
`in-progress`; Step 9 sets `review`), and those edits ride into `main` with the eventual PR merge.

---

## Phase 5: Git Setup

### Case A — `{{context}}` is `worktree` (reuse)

Skip worktree creation. You're already in the right place. Print:
```
Reusing current worktree: <git rev-parse --show-toplevel>
Branch:                   story/{{story_key}}
Issue:                    #{{issue_number}} — status:in-progress
```

Then proceed to Phase 6.

### Case B — `{{context}}` is `main` (create)

#### Step 1: Resolve Worktree Root

Read and follow `${CLAUDE_PLUGIN_ROOT}/references/resolve-worktree-root.md`.

#### Step 2: Check for existing worktree/branch

```
git worktree list
git branch --list "story/{{story_key}}"
git ls-remote --heads origin "story/{{story_key}}"
```

Three sub-cases:

- **Worktree exists** → reuse it. `cd` there and continue.
- **Branch exists (locally or remotely) but no worktree** →
  ```
  git fetch origin "story/{{story_key}}" 2>/dev/null || true
  git worktree add <worktree-root>/story-{{story_key}} story/{{story_key}}
  ```
- **Neither exists** →
  ```
  git worktree add <worktree-root>/story-{{story_key}} -b story/{{story_key}}
  ```

If `git worktree add -b` fails because the branch was just created by another agent (race), retry with the no-`-b` form:
```
git worktree add <worktree-root>/story-{{story_key}} story/{{story_key}}
```

If that also fails, the story is being worked on elsewhere. Tell the user and stop.

#### Step 3: Switch into the worktree

```
cd <worktree-root>/story-{{story_key}}/
```

Print:
```
=== Worktree Ready ===

Story:     {{story_id}} - {{story_title}}
Branch:    story/{{story_key}}
Worktree:  <worktree-root>/story-{{story_key}}/
Issue:     #{{issue_number}} — status:in-progress
```

---

## Phase 6: Run BMAD dev-story

Read and follow `${CLAUDE_PLUGIN_ROOT}/references/bmad-workflow-loader.md` with `<operation>` = `dev-story`.

BMAD's own `dev-story` workflow will edit `sprint-status.yaml` inside this worktree at Step 4 (`→ in-progress`) and 
Step 9 (`→ review`). Those edits commit as part of the dev work and ride into `main` with the PR merge — no plugin 
action required here.

### Auto-Commit Instruction (Layer on top of BMAD dev-story)

**After each task is marked `[x]` in the story file and the story file is saved**, also run:

```
git add -A
git commit -m "feat({{story_id}}): <brief task description>"
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

## Phase 7: Create PR (After All Tasks Complete)

After the BMAD dev-story operation completes and the story status in the story file is `review`:

### Step 1: Push the branch
```
git push -u origin story/{{story_key}}
```

### Step 2: Confirm the GitHub issue number

You already resolved `{{issue_number}}` in Phase 2 — reuse it. (If unavailable, look it up again in `<output_folder>/implementation-artifacts/github-issue-map.json` using the story ID.)

### Step 3: Build the label set

The PR and issue should end up with the **same labels** (except `status:*` labels, which only live on the issue).

**a) Fetch existing issue labels:**
```
gh issue view {{issue_number}} --json labels --jq '.labels[].name'
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
  --title "Story {{story_id}}: {{story_title}}" \
  --label "<comma-separated shared label set>" \
  --body "Closes #{{issue_number}}

## User Story
<from story file>

## Changes
<summarize the implementation from the story file's task list and File List section>

## Test Coverage
<summarize tests written>

---
_Developed via BMAD workflow_"
```

The `Closes #{{issue_number}}` in the PR body means **merging the PR will auto-close the GitHub issue** — which triggers the `bmad-story-sync` GitHub Actions workflow to mark the story `done` in `sprint-status.yaml` on `main`.

### Step 5: Sync labels to the issue

Ensure the issue has the same shared label set (adds any new file-based labels that weren't on the issue yet):
```
gh issue edit {{issue_number}} --add-label "<comma-separated shared label set>"
```

### Step 6: Update GitHub issue status label
```
gh issue edit {{issue_number}} --remove-label "status:in-progress" --add-label "status:review"
```

### Step 7: Report

```
=== Story Development Complete ===

Story:   {{story_id}} - {{story_title}}
Branch:  story/{{story_key}}
PR:      <pr_url>
Issue:   #{{issue_number}}
Status:  review
Labels:  <shared label set>

Commits: <count> commits created during development

Next steps:
  1. Start Story Review (SR) in this worktree for code review
  2. Or, the user can review the PR directly on GitHub
```
