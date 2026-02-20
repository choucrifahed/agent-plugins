---
name: story-setup-ci
description: Install the BMAD Story Sync GitHub Actions workflow into the current project
---

# Story Setup CI: Install BMAD Story Sync Workflow

You are installing a GitHub Actions workflow that automatically syncs GitHub issue closures back to BMAD files.

## What the Workflow Does

- **Trigger:** Runs when a GitHub issue is closed
- **Behavior:** Looks up the closed issue in `github-issue-map.json`, verifies a merged PR exists, then marks the corresponding story as `done` in `sprint-status.yaml` and the story `.md` file. Also updates GitHub labels and checks for epic completion.
- **Config:** Dynamically resolves the BMAD output folder at runtime by checking `_bmad/bmm/config.yaml`, then `_bmad/bmb/config.yaml`, falling back to `_bmad-output`

## Steps

### 1. Read the workflow template

Read the template file:
```
${CLAUDE_PLUGIN_ROOT}/references/bmad-story-sync.yml
```

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
  - Verifies a merged PR exists for the issue
  - Marks the story as done in sprint-status.yaml and the story .md file
  - Updates GitHub issue labels (adds status:done)
  - Checks if all stories in the epic are done and updates epic status
  - Commits and pushes the changes

No configuration needed — the workflow reads your BMAD config at runtime.
```