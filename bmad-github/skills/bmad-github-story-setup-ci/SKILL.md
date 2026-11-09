---
name: bmad-github-story-setup-ci
description: 'Install the BMAD Story Sync GitHub Actions workflow into the current project. Automates marking stories done when issues close on GitHub. Use when the user invokes the SCI menu code in bmad help, or asks to set up CI for BMAD story sync, or asks to install the BMAD story-sync GitHub Action.'
---

# Story Setup CI: Install BMAD Story Sync Workflow

You are installing a GitHub Actions workflow that automatically syncs GitHub issue closures back to BMAD files.

## What the Workflow Does

- **Trigger:** Runs when a GitHub issue is closed
- **Behavior:** Looks up the closed issue in `github-issue-map.json`, verifies that a merged PR closed it, then marks the corresponding story as `done` in `sprint-status.yaml` (and in a legacy story file's `Status:` line). Also updates GitHub labels and checks for epic completion.
- **Config:** Installs `uv` and runs BMad's own resolver, `_bmad/scripts/resolve_config.py`, to find
  `implementation_artifacts` in the committed config (`_bmad/config.toml` plus `_bmad/custom/config.toml`).
- **Requirement:** the repository must commit BMad's `_bmad/` folder (v6.12+). Personal `*.user.toml` layers stay
  gitignored and are not visible to CI.

## Steps

### 1. Read the workflow template

Read the template file `./assets/bmad-story-sync.yml`.

Store its full contents — it will be written verbatim with no modifications.

### 2. Check if workflow already exists

Check whether `.github/workflows/bmad-story-sync.yml` already exists in the user's project.

If it exists, warn the user:
```
The file .github/workflows/bmad-story-sync.yml already exists.
Do you want to overwrite it with the latest template?
```

If the user declines, stop here.

### 3. Install the workflow

1. Ensure the `.github/workflows/` directory exists (create it if needed)
2. Write the template contents verbatim to `.github/workflows/bmad-story-sync.yml`

### 4. Report

Tell the user:

```
Installed .github/workflows/bmad-story-sync.yml

This workflow triggers when a GitHub issue is closed and:
  - Looks up the issue in github-issue-map.json
  - Verifies that a merged PR closed the issue
  - Marks the story as done in sprint-status.yaml (and in a legacy story file)
  - Updates GitHub issue labels (adds status:done)
  - Checks if all stories in the epic are done and updates epic status
  - Commits and pushes the changes

No configuration needed: the workflow reads your BMAD config at runtime. Commit BMad's _bmad/ folder
so the workflow can run BMad's config resolver.
```
