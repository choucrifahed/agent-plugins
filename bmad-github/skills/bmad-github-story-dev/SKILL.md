---
name: bmad-github-story-dev
description: "Deprecated: `bmad-github-story-build` (Story Build, SB) is now the official way to build a story. Only use this when explicitly invoked by name"
metadata:
  lifecycle: shim
---

# Story Dev (deprecated): Worktree + BMAD `bmad-dev-story` + PR

> **Deprecated.** BMad v6.11 made `bmad-build` its official implementation flow and deprecated `bmad-create-story` and
> `bmad-dev-story`. Use **Story Build (SB)** instead. This skill keeps working while BMad's deprecated
> `bmad-dev-story` skill is installed, and goes away when BMad removes it in v7.

Start by printing:

```
Deprecated: Story Build (SB) is now the official way to build a story. Story Dev runs only while BMad's deprecated bmad-dev-story skill is installed.
```

This skill:

1. Detects the working context (main checkout vs. existing story worktree)
2. Syncs local state
3. Picks the target story (from the branch name, user argument, or next `status:ready` GitHub issue)
4. Verifies the story file is committed
5. Flips the GitHub issue status label (the cross-agent lock)
6. Sets up a git worktree/branch, or reuses the current one
7. Invokes BMAD's deprecated `bmad-dev-story` skill with auto-commits per task
8. Creates a PR when development is complete

---

## On Activation

### Load Config

1. Set `{project-root}` to the output of `git rev-parse --show-toplevel`.
2. Run:
   ```
   uv run {project-root}/_bmad/scripts/resolve_config.py --project-root {project-root} --key modules.bmm.planning_artifacts --key modules.bmm.implementation_artifacts --key modules.bmad-github.worktree_root
   ```
   If `{project-root}/_bmad/scripts/resolve_config.py` does not exist in this checkout (for example a worktree of a
   repository that does not commit `_bmad/`), run the same command with `--project-root` set to the main checkout: the
   parent directory of `git rev-parse --path-format=absolute --git-common-dir`.
3. Resolve from the JSON output:
   - `{planning_artifacts}` and `{implementation_artifacts}` — `{project-root}`-prefixed paths; resolve them against
     the current checkout.
   - `{worktree_root}` — optional. Default `../{repo-name}-worktrees`. Replace `{repo-name}` with the basename of the
     main checkout, and resolve a relative value against the main checkout.
4. If the command fails (including `uv` being unavailable), report its output and HALT:
   ```
   bmad-github needs BMad v6.12+ and uv. Install uv (https://docs.astral.sh/uv/), then run `npx bmad-method install`.
   ```
   If either `modules.bmm.*` key is missing, HALT and tell the user to install the BMad Method module (`bmm`).

---

## Phase 0: Detect Worktree Context

Run these together and record the results:

```
git rev-parse --show-toplevel
git branch --show-current
```

| Branch name | Context | Worktree creation in Phase 5 |
|---|---|---|
| `main` (or the repo's main branch) | **main checkout** | Create a new worktree |
| `story/<key>` | **existing story worktree** | Reuse — skip creation |
| any other branch | **unrecognized** | HALT |

If the branch is unrecognized, print and HALT:
```
Current branch is `<branch>`. This skill expects either `main` or a `story/<key>` branch.
Switch to `main` (or to the story worktree you want to continue) and re-run.
```

Save `{context}` = `main` | `worktree`.

---

## Phase 1: Sync First

- **`{context}` is `main`:** invoke the `bmad-github-story-sync` skill and let it finish, then continue here, so
  `bmad-dev-story` sees a current `sprint-status.yaml`.
- **`{context}` is `worktree`:** run `git fetch origin` and warn that `sprint-status.yaml` may lag `main`.

---

## Phase 2: Pick the Target Story

Determine the **story key** (e.g., `1-2-bridge-interface-and-shared-type-contracts`) and **story ID** (e.g., `1-2`):

### Case A — `{context}` is `worktree`

```
story_key = branch name with the "story/" prefix removed
story_id  = leading "<N>-<M>" segments of story_key
```

### Case B — `{context}` is `main`

1. **If the user passed an explicit story key or ID** (e.g., "dev 1-3"), use it. Verify it exists in
   `{implementation_artifacts}/github-issue-map.json`.
2. **Otherwise, pick the next ready story from GitHub:**
   ```
   gh issue list --label "status:ready" --state open --json number,title,labels,milestone --limit 50
   ```
   - If the list is empty, HALT: `No story has status:ready on GitHub. Run Story Build (SB) instead.`
   - Pick the lowest story ID (story titles start with `Story <N>.<M>:`).
   - Recover the full story key from the story file name in `{implementation_artifacts}`.

Save `{story_key}`, `{story_id}`, and `{issue_number}` (from `github-issue-map.json`).

---

## Phase 3: Verify Story File

1. **Find the story file:** `{implementation_artifacts}/{story_key}.md`, or `{implementation_artifacts}/{story_id}-*.md`
   as fallback. If none exists, HALT:
   ```
   Story file not found for {story_key}. Run Story Build (SB) instead: it plans and builds the story in one run.
   ```
2. **Verify it is committed:** `git status --porcelain {implementation_artifacts}/`. If the story file is uncommitted,
   HALT and ask the user to commit it first.
3. **Read the story title** from the file.
4. **Check blocking dependencies:** if the story file has a `### Blocked By` section, look up each listed story's
   issue label on GitHub. If any is not `status:done`, HALT and list them.

---

## Phase 4: Claim the Story

```
gh issue edit {issue_number} \
  --remove-label "status:backlog" \
  --remove-label "status:ready" \
  --add-label "status:in-progress"
```

Do not edit `sprint-status.yaml` on `main`. `bmad-dev-story` writes it inside the worktree, and the edits reach `main`
with the PR merge.

---

## Phase 5: Git Setup

### Case A — `{context}` is `worktree`

Reuse it and print the worktree path, branch, and issue.

### Case B — `{context}` is `main`

1. Check `git worktree list`, `git branch --list "story/{story_key}"`, and
   `git ls-remote --heads origin "story/{story_key}"`:
   - **Worktree exists** → reuse it.
   - **Branch exists, no worktree** → `git worktree add {worktree_root}/story-{story_key} story/{story_key}`
   - **Neither exists** → `git worktree add {worktree_root}/story-{story_key} -b story/{story_key}`

   If `-b` fails because another agent created the branch, retry without `-b`. If that fails too, HALT.
2. `cd {worktree_root}/story-{story_key}` and run every later command from there.

---

## Phase 6: Develop the Story with `bmad-dev-story`

Invoke the `bmad-dev-story` skill on `{implementation_artifacts}/{story_key}.md`.

If `bmad-dev-story` is not available, HALT:
```
BMad's bmad-dev-story skill is not installed. BMad v6.12 deprecated it and leaves it out of fresh installs.
Use Story Build (SB), which builds the story with bmad-build. To keep using Story Dev until BMad v7,
re-run the BMad installer with --shims.
```

### Auto-Commit Instruction (on top of `bmad-dev-story`)

**After each task is marked `[x]` in the story file and the story file is saved**, also run:

```
git add -A
git commit -m "feat({story_id}): <brief task description>"
```

Use the matching conventional commit prefix: `feat`, `test`, `fix`, `refactor`, or `chore`.

---

## Phase 7: Create PR (After All Tasks Complete)

When `bmad-dev-story` completes and the story file's `Status:` is `review`, invoke the `bmad-github-story-open-pr`
skill with `{story_id}`, `{story_key}`, `{story_title}`, `{issue_number}`, and `{record_file}` = the story file.

---

## Phase 8: Report

```
=== Story Development Complete ===

Story:   {story_id} - {story_title}
Branch:  story/{story_key}
PR:      <pr_url>
Issue:   #{issue_number} — status:review

Next steps:
  1. Optional: run Story Review (SR) in this worktree for a code review pass
  2. Review and merge the PR on GitHub
  3. Run Story Sync (SY) from the main checkout

Story Dev is deprecated: use Story Build (SB) for the next story.
```
