---
name: bmad-github-story-create
description: 'Sync GitHub state then plan the next story end-to-end via the BMAD create-story flow. Detects blocking dependencies and updates the GitHub issue label to ready. Use when the user invokes the SC menu code in bmad help, or asks to plan/create the next story, or asks to start the next BMAD story.'
---

# Story Create: Sync + BMAD Create-Story

You are creating a new story for development. This skill orchestrates two phases:
1. Sync GitHub state (catch up on merged PRs)
2. Run the BMAD create-story operation (creates the story file with full user engagement)

After the operation, the user reviews the output, commits when happy, then runs Story Dev (SD) to start implementation.

**IMPORTANT:** This skill MUST be run from the main repo directory (not a worktree).

---

## Phase 0: Sync First

Read and follow `${CLAUDE_PLUGIN_ROOT}/references/sync-first.md`.

---

## Phase 1: Run BMAD create-story

Read and follow `${CLAUDE_PLUGIN_ROOT}/references/bmad-workflow-loader.md` with `<operation>` = `create-story`.

After the operation completes, note:
- The **story ID** (e.g., `1-2`)
- The **story key/slug** from the story file name (e.g., `1-2-bridge-interface-and-shared-type-contracts`)
- The **story title** (e.g., `Bridge Interface & Shared Type Contracts`)
- The **story file path** in `<output_folder>/implementation-artifacts/`

---

## Phase 1.5: Check for Blocking Dependencies

After the BMAD operation completes and the story file is saved, determine whether this story has real dependencies on other incomplete stories in the same epic.

**The goal is to maximize parallel development** — only block when there is a genuine implementation dependency, not because of sequential numbering.

1. **Identify candidate stories:**
   Extract the epic number from the story ID (e.g., `1-3` → epic 1).
   Find all other stories in the same epic that are NOT `done` in `sprint-status.yaml` (excluding the current story).

2. **Analyze for real dependencies:**
   Read the story file you just created — look at the implementation details: packages modified, types/APIs consumed, files touched, build dependencies, and task descriptions.

   For each candidate story, read its story file (or its epic description if no story file exists yet) and determine: **does the current story depend on code, types, APIs, or infrastructure that the candidate story produces?**

   Examples of real dependencies:
   - Current story imports types that the candidate story defines
   - Current story modifies a package that the candidate story creates
   - Current story's tests use utilities that the candidate story implements
   - Current story builds on APIs or interfaces introduced by the candidate story

   Examples that are NOT dependencies:
   - Stories touch different packages with no shared interfaces
   - Stories work on independent features within the same package
   - Sequential numbering alone (1-2 does not automatically require 1-1)

3. **If any genuine blocking dependencies exist and are NOT `done`**, add a `### Blocked By` section at the very beginning of the `## Dev Notes` section in the story file:

   Example (for story 1-3 that depends on types from 1-2):
   ```markdown
   ## Dev Notes

   ### Blocked By
   > **This story cannot start development until the following stories are completed:**
   > - 1-2-bridge-interface-and-shared-type-contracts (status: in-progress)
   >   Reason: This story imports the Bridge interface and ThemeTokens type defined in story 1-2.
   ```

   - List ONLY stories that are genuine dependencies AND are NOT `done`
   - Use the full story key from sprint-status.yaml with current status in parentheses
   - Include a brief reason explaining the dependency
   - If there are NO real blocking dependencies, do NOT add this section

---

## Phase 2: Status Update

### Step 1: Update GitHub issue label

Look up the issue number from `<output_folder>/implementation-artifacts/github-issue-map.json` using the story ID (e.g., `1-2`).

```
gh issue edit <number> --remove-label "status:backlog" --add-label "status:ready"
```

### Step 2: Report

Print a clear summary:

```
=== Story Planned ===

Story:     <story_id> - <story_title>
File:      <output_folder>/implementation-artifacts/<story-file>.md
Issue:     #<number> (<url>) — status:ready

Next steps:
  1. Review the story file and make any edits you want
  2. Commit and push when you're happy:
     git add <output_folder>/implementation-artifacts/
     git commit -m "chore(story): create story <story_id> - <story_key>"
     git push
  3. Start Story Dev (SD) to create a worktree and begin implementation
```
