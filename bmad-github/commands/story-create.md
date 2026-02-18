---
name: 'story-create'
description: 'Sync GitHub state, then run BMAD create-story workflow with full user engagement to plan a story'
---

# Story Create: Sync + BMAD Create-Story

You are creating a new story for development. This command orchestrates two phases:
1. Sync GitHub state (catch up on merged PRs)
2. Run the BMAD create-story workflow (creates the story file with full user engagement)

After the workflow, the user reviews the output, commits when happy, then runs `/story-dev` to start implementation.

**IMPORTANT:** This command MUST be run from the main repo directory (not a worktree).

---

## Phase 0: Sync First

Run the full `/story-sync` logic to catch up on any merged PRs before picking the next story.
This ensures sprint-status.yaml is current.

Specifically, execute the same steps as the story-sync command:
1. Verify on main branch, pull latest
2. Read issue map and sprint-status.yaml
3. Query GitHub for closed issues
4. Sync any closed issues → BMAD done
5. Clean up completed worktrees
6. Commit sync changes if any

If sync made changes, push them before proceeding.

---

## Phase 1: Run BMAD create-story Workflow

Execute the standard BMAD create-story workflow using the 5-step loader pattern:

<steps CRITICAL="TRUE">
1. Always LOAD the FULL @{project-root}/_bmad/core/tasks/workflow.xml
2. READ its entire contents - this is the CORE OS for EXECUTING the specific workflow-config @{project-root}/_bmad/bmm/workflows/4-implementation/create-story/workflow.yaml
3. Pass the yaml path @{project-root}/_bmad/bmm/workflows/4-implementation/create-story/workflow.yaml as 'workflow-config' parameter to the workflow.xml instructions
4. Follow workflow.xml instructions EXACTLY as written to process and follow the specific workflow config and its instructions
5. Save outputs after EACH section when generating any documents from templates
</steps>

After the workflow completes, note:
- The **story ID** (e.g., `1-2`)
- The **story key/slug** from the story file name (e.g., `1-2-bridge-interface-and-shared-type-contracts`)
- The **story title** (e.g., `Bridge Interface & Shared Type Contracts`)
- The **story file path** in `_bmad-output/implementation-artifacts/`

---

## Phase 1.5: Check for Blocking Dependencies

After the BMAD workflow completes and the story file is saved, determine whether this story has real dependencies on other incomplete stories in the same epic.

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

Look up the issue number from `_bmad-output/implementation-artifacts/github-issue-map.json` using the story ID (e.g., `1-2`).

```
gh issue edit <number> --remove-label "status:backlog" --add-label "status:ready"
```

### Step 2: Report

Print a clear summary:

```
=== Story Planned ===

Story:     <story_id> - <story_title>
File:      _bmad-output/implementation-artifacts/<story-file>.md
Issue:     #<number> (<url>) — status:ready

Next steps:
  1. Review the story file and make any edits you want
  2. Commit and push when you're happy:
     git add _bmad-output/implementation-artifacts/
     git commit -m "chore(story): create story <story_id> - <story_key>"
     git push
  3. Run /story-dev to create a worktree and start implementation
```
