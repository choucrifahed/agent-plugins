---
name: bmad-github-story-open-pr
description: 'Push a story branch and open (or update) its GitHub PR: Closes the story issue, shares labels between the PR and the issue, and moves the issue to status:review. Use when Story Build or Story Dev invokes it, or when the user asks to open the PR for the current story worktree.'
---

# Story Open PR: Push + PR + `status:review`

Opens the pull request for one story branch. Story Build (SB) and the deprecated Story Dev invoke this skill once the
story is built. It also runs on its own from a `story/<key>` worktree, for example after finishing a story by hand.

## Inputs

A calling skill passes:
- `{story_id}` — e.g. `1-2`
- `{story_key}` — the branch suffix, e.g. `1-2-bridge-interface`
- `{story_title}`
- `{issue_number}`
- `{record_file}` — the story's `bmad-build` spec, or its legacy story file

When invoked directly, resolve whatever was not passed, in Phase 1.

---

## On Activation

### Load Config

1. Set `{project-root}` to the output of `git rev-parse --show-toplevel`.
2. Run:
   ```
   uv run {project-root}/_bmad/scripts/resolve_config.py --project-root {project-root} --key modules.bmm.planning_artifacts --key modules.bmm.implementation_artifacts
   ```
   If `{project-root}/_bmad/scripts/resolve_config.py` does not exist in this checkout (for example a worktree of a
   repository that does not commit `_bmad/`), run the same command with `--project-root` set to the main checkout: the
   parent directory of `git rev-parse --path-format=absolute --git-common-dir`.
3. Resolve `{planning_artifacts}` and `{implementation_artifacts}` from the JSON output. They are
   `{project-root}`-prefixed paths; resolve them against the current checkout.
4. If the command fails (including `uv` being unavailable), report its output and HALT:
   ```
   bmad-github needs BMad v6.12+ and uv. Install uv (https://docs.astral.sh/uv/), then run `npx bmad-method install`.
   ```
   If either key is missing, HALT and tell the user to install the BMad Method module (`bmm`).

---

## Phase 1: Resolve Missing Inputs

Skip this phase when the calling skill passed every input.

1. Run `git branch --show-current`. If the branch is not `story/<key>`, HALT:
   ```
   Story Open PR runs from a story worktree (branch story/<key>). Current branch: <branch>.
   ```
2. `{story_key}` = the branch name without `story/`. `{story_id}` = its leading `<N>-<M>` segments.
3. `{issue_number}` = the `number` for `{story_id}` in `{implementation_artifacts}/github-issue-map.json`.
4. `{story_title}` = the issue title after `Story <N>.<M>: ` (`gh issue view {issue_number} --json title`).
5. `{record_file}` = `{implementation_artifacts}/spec-{story_id}-*.md` (the most recent one, if several), or else the
   legacy story file `{implementation_artifacts}/{story_id}-*.md`.

If the working tree is not clean (`git status --porcelain`), show the changes and ask the user whether to commit them
first. HALT and wait for the answer.

---

## Phase 2: Push the Branch

```
git push -u origin story/{story_key}
```

## Phase 3: Check for an Existing PR

```
gh pr view story/{story_key} --json number,url,state
```

- **An open PR exists** (a re-run on a story that already has one): add a PR comment that summarizes the new commits
  (`git log --oneline origin/main..HEAD`), then go to Phase 6.
- **No PR, or only a closed one**: continue with Phase 4.

## Phase 4: Build the Label Set

The PR and the issue get the **same labels**, except `status:*` labels, which live only on the issue.

1. Existing issue labels, without `status:*`:
   ```
   gh issue view {issue_number} --json labels --jq '.labels[].name'
   ```
2. File-based labels from the branch diff:
   ```
   git diff --name-only origin/main...HEAD
   ```
   - `*.ts`, `*.tsx` → `typescript`
   - `*.js`, `*.mjs`, `*.cjs` → `javascript`
   - `*.css`, `*.scss` → `css`
   - `*.html` → `html`
   - `.github/**` → `github_actions`
   - `*.md` outside `{planning_artifacts}` and `{implementation_artifacts}` → `documentation`
   - `package.json`, `pnpm-lock.yaml` → `dependencies`
   - `*.test.ts`, `*.test.js`, `__tests__/**` → `qa`
3. Merge both into one unique set: the **shared label set**.

## Phase 5: Create the PR

Read `{record_file}` for the content of the body.

```
gh pr create \
  --head story/{story_key} \
  --title "Story {story_id}: {story_title}" \
  --label "<comma-separated shared label set>" \
  --body "Closes #{issue_number}

## Intent
<the record's Intent section, or its User Story>

## Changes
<summary of the implementation: the record's Implementation Notes, Tasks, or File List, plus git diff --stat>

## Verification
<tests written and run; review findings that were fixed, from the record's Review Triage Log or Review Findings>

---
_Built with BMad via bmad-github_"
```

`Closes #{issue_number}` makes the merge close the issue, which triggers the `bmad-story-sync` CI workflow (if
installed) to mark the story `done` on `main`.

Add the shared label set to the issue:
```
gh issue edit {issue_number} --add-label "<comma-separated shared label set>"
```

## Phase 6: Move the Issue to Review

```
gh issue edit {issue_number} --remove-label "status:in-progress" --add-label "status:review"
```

## Phase 7: Report

Return to the calling skill, or when invoked directly print:

```
=== Story PR Ready ===

Story:   {story_id} - {story_title}
Branch:  story/{story_key}
PR:      <pr_url>
Issue:   #{issue_number} — status:review
Labels:  <shared label set>
```
