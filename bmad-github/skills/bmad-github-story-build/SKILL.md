---
name: bmad-github-story-build
description: 'Build one BMad story end-to-end with GitHub: pick the next story from GitHub (or use the current story worktree), claim its issue, create or reuse a git worktree, invoke bmad-build to plan, implement and review it, then push and open a PR that closes the issue. Use when the user invokes the SB menu code in bmad help, or asks to build, implement or develop the next story or a specific story.'
---

# Story Build: GitHub + Worktree around `bmad-build`

`bmad-build` is BMad's official implementation flow: it plans one story, implements it, reviews it with independent
reviewers, fixes what belongs to the change, and commits locally. It does not own the backlog, pick the next story,
push, or open a PR. This skill adds exactly those parts:

1. Load config and detect the working context (main checkout or existing story worktree)
2. Sync local state with GitHub
3. Pick the story (from the branch name, the user's request, or the next open GitHub issue)
4. Check blocking dependencies
5. Claim the GitHub issue (`status:in-progress` acts as the cross-agent lock)
6. Create or reuse the story's git worktree
7. Invoke `bmad-build` on the story
8. Push the branch, open the PR (`Closes #N`), and set the issue to `status:review`

This skill is safe to run from `main` **or** from inside a `story/<key>` worktree, so it composes with orchestrators
that spawn agents in pre-created worktrees.

BMad recommends a **fresh chat** for each `bmad-build` run. Start this skill in a new session when you can.

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

## Phase 1: Detect Worktree Context

Run these together and record the results:

```
git rev-parse --show-toplevel
git branch --show-current
```

| Branch name | Context | Worktree in Phase 6 |
|---|---|---|
| `main` (or the repo's main branch) | **main checkout** | Create or reuse one |
| `story/<key>` | **existing story worktree** | Reuse the current one |
| any other branch | **unrecognized** | HALT |

If the branch is unrecognized, print and HALT:
```
Current branch is `<branch>`. Story Build expects `main` or a `story/<key>` branch.
Switch to `main` (or to the story worktree you want to continue) and re-run.
```

Save `{context}` = `main` | `worktree`.

---

## Phase 2: Sync First

- **`{context}` is `main`:** invoke the `bmad-github-story-sync` skill and let it finish, then continue here. This
  matters for correctness, not just freshness: `bmad-build` reads `sprint-status.yaml` from disk, and a PR merged since
  the last sync would otherwise still look unfinished.
- **`{context}` is `worktree`:** run `git fetch origin` and warn once:
  ```
  ⚠ Running from worktree `<branch>`. sprint-status.yaml here may lag main.
    If PRs were merged since this worktree was created, run Story Sync (SY) from the main checkout first.
  ```
  GitHub `status:*` labels are queried live, so cross-agent coordination stays correct.

---

## Phase 3: Pick the Story

Read `{implementation_artifacts}/github-issue-map.json` (story ID such as `1-2` → `{number, url}`). If it does not
exist, HALT and tell the user to run Story Init (SI) first.

BMad requires sprint planning before implementation. If `{implementation_artifacts}/sprint-status.yaml` does not exist,
HALT:
```
No sprint-status.yaml found. Invoke the `bmad-sprint-planning` skill first (it gates readiness and generates sprint
tracking), then run Story Init (SI) and Story Build (SB).
```

Determine `{story_id}` (e.g. `1-2`):

- **`{context}` is `worktree`:** take the leading `<N>-<M>` segments of the branch name after `story/`.
- **The user named a story** (e.g. "build 1-3" or "implement story 1.3"): use it. Verify it is in the issue map.
- **Otherwise, pick the next story from GitHub:**
  ```
  gh issue list --state open --label "status:ready" --json number,title,labels --limit 100
  gh issue list --state open --label "status:backlog" --json number,title,labels --limit 100
  ```
  Story issue titles start with `Story <N>.<M>:`. Prefer `status:ready` stories, then `status:backlog`; within each
  group pick the lowest epic, then the lowest story number. Ignore issues that are not in the issue map. If both lists
  are empty, HALT:
  ```
  No open story with status:ready or status:backlog. Every story is in progress, in review, or done.
  ```

Then resolve:
- `{issue_number}` — from the issue map.
- `{story_key}` — the full `development_status` key in `sprint-status.yaml` whose first two segments equal
  `{story_id}` (e.g. `1-2-bridge-interface`). Match the numbers exactly, so `1-1` never matches `1-10`. If none
  matches, use `{story_id}` and warn that the story is not in sprint tracking (suggest re-running `bmad-sprint-planning`).
- `{story_title}` — from the issue title (text after `Story <N>.<M>: `).

If `{context}` is `worktree` and the branch's key differs from `{story_key}`, keep the branch's key as `{story_key}`.

---

## Phase 4: Check Blocking Dependencies

Maximize parallel work: only block on a genuine implementation dependency, never on numbering alone.

1. Collect the other stories of the same epic from the issue map (keys starting with `<epic>-`). For each, read its
   status label:
   ```
   gh issue view <number> --json number,title,labels --jq '{n:.number, labels:[.labels[].name]}'
   ```
   Stories with `status:done` are complete. All others are candidates. If GitHub is unreachable, fall back to
   `sprint-status.yaml` and note that the view may be stale.
2. Read this story in `{planning_artifacts}/epics.md` (and its spec or story file in `{implementation_artifacts}`, if
   one exists). For each candidate, read its section in `epics.md` and decide: **does this story need code, types,
   APIs, or infrastructure that the candidate produces?**
   - Real dependency: importing types the candidate defines, modifying a package it creates, using utilities or APIs
     it introduces.
   - Not a dependency: different packages with no shared interface, independent features, sequential numbering alone.
3. If a genuine dependency is not `status:done`, HALT without claiming the issue:
   ```
   === Story Blocked ===

   Story {story_id} - {story_title} depends on stories that are not done:
     - <dep_story_key> (current label: <status>) — <one-line reason>

   Build those first, or name another story: "build <story id>".
   ```

---

## Phase 5: Claim the Story

The label flip is the cross-agent lock:

```
gh issue edit {issue_number} \
  --remove-label "status:backlog" \
  --remove-label "status:ready" \
  --add-label "status:in-progress"
```

Do not edit `sprint-status.yaml` on `main`. `bmad-build` moves the story to `in-progress` and later `review` inside the
worktree, and those edits reach `main` with the PR merge.

---

## Phase 6: Git Worktree

### `{context}` is `worktree`

Reuse it. Print:
```
Reusing worktree: <git rev-parse --show-toplevel>
Branch:           story/{story_key}
Issue:            #{issue_number} — status:in-progress
```

### `{context}` is `main`

1. Check for an existing worktree or branch:
   ```
   git worktree list
   git branch --list "story/{story_key}"
   git ls-remote --heads origin "story/{story_key}"
   ```
   - **Worktree exists** → reuse it.
   - **Branch exists (locally or remotely), no worktree** →
     ```
     git fetch origin "story/{story_key}" 2>/dev/null || true
     git worktree add {worktree_root}/story-{story_key} story/{story_key}
     ```
   - **Neither exists** →
     ```
     git worktree add {worktree_root}/story-{story_key} -b story/{story_key}
     ```
   If `git worktree add -b` fails because another agent just created the branch, retry without `-b`. If that also
   fails, the story is being worked on elsewhere: tell the user and HALT.
2. Change into the worktree (`cd {worktree_root}/story-{story_key}`) and run every later command from there.
   `{implementation_artifacts}` and `{planning_artifacts}` now resolve against the worktree.
3. Print:
   ```
   === Worktree Ready ===

   Story:     {story_id} - {story_title}
   Branch:    story/{story_key}
   Worktree:  {worktree_root}/story-{story_key}/
   Issue:     #{issue_number} — status:in-progress
   ```

---

## Phase 7: Build the Story with `bmad-build`

Choose what to hand `bmad-build`, first match wins:

1. **An unfinished spec for this story** — `{implementation_artifacts}/spec-{story_id}-*.md` whose frontmatter `status`
   is `draft`, `ready-for-dev`, `in-progress`, or `in-review`. Pass its path; `bmad-build` resumes it.
2. **A legacy story file** from the deprecated Story Create — `{implementation_artifacts}/{story_id}-*.md`. Pass its path
   as the intent: "Implement the story in `<path>`. Its sprint-status key is `{story_key}`."
3. **Otherwise** pass the story itself:
   ```
   Implement story {story_id} ({story_key}): {story_title}, from {planning_artifacts}/epics.md.
   Its sprint-status key is {story_key}. GitHub issue #{issue_number}.
   ```

If the user's request carries its own intent for this story (for example "address these review findings" on a story
whose spec is already `done`), pass that intent verbatim, followed by the path of the story's latest spec as context.

Invoke the `bmad-build` skill with that input. If `bmad-build` is not available, HALT and tell the user to install or
update BMad (`npx bmad-method install`, BMad Method module).

While `bmad-build` runs:
- Its questions and checkpoints belong to the user. Relay them; never answer them on the user's behalf.
- It commits locally and does not push. Leave its commits as they are.
- When it finishes, it offers next actions such as creating a pull request. Do not take that offer: Phase 8 opens the PR
  with the issue link.

After `bmad-build` exits, find `{spec_file}`: the `spec-{story_id}-*.md` file it wrote or updated in
`{implementation_artifacts}`.

- **Its frontmatter `status` is `done`** → continue to Phase 8.
- **Otherwise** (the user chose "Approve and stop", or `bmad-build` halted for an intent gap or a failure) → do not
  push. Print and stop:
  ```
  === Story Build Paused ===

  Story:   {story_id} - {story_title}
  Spec:    {spec_file} (status: <status>)
  Branch:  story/{story_key}
  Issue:   #{issue_number} — status:in-progress

  Resume with Story Build (SB) from this worktree; bmad-build picks the spec up where it stopped.
  ```

Then check `git status --porcelain`. `bmad-build` declares any files it left uncommitted as residual artifacts. If
there are any, show them and ask the user whether to commit them, discard them, or leave them out of the PR. HALT and
wait for the answer.

---

## Phase 8: Push and Open the PR

Invoke the `bmad-github-story-open-pr` skill with `{story_id}`, `{story_key}`, `{story_title}`, `{issue_number}`, and
`{record_file}` = `{spec_file}`. It pushes the branch, opens the PR (or comments on the existing one), syncs labels, and
moves the issue to `status:review`.

---

## Phase 9: Report

```
=== Story Built ===

Story:   {story_id} - {story_title}
Spec:    {spec_file}
Branch:  story/{story_key}
PR:      <pr_url>
Issue:   #{issue_number} — status:review
Labels:  <shared label set>

Next steps:
  1. Review the PR on GitHub. bmad-build has already reviewed and fixed the change.
  2. Optional: run Story Review (SR) in this worktree for an extra review pass (for example after addressing PR
     comments, or with a different model).
  3. Merge the PR when satisfied. It closes issue #{issue_number}.
  4. Run Story Sync (SY) from the main checkout, unless the Story Sync CI workflow is installed.
```
