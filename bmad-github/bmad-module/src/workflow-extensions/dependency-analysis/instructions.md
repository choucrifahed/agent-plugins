# Dependency Analysis — Post-Story-Creation Step

After a story file is created and saved, determine whether it has real dependencies on other incomplete stories in the same epic.

**Goal: maximize parallel development.** Only block when there is a genuine implementation dependency, not because of sequential numbering.

## Step 1: Identify Candidate Stories

Extract the epic number from the story ID (e.g., `1-3` → epic 1). Find all other stories in the same epic that are NOT `done` in the sprint status tracker (excluding the current story).

## Step 2: Analyze for Real Dependencies

Read the story file just created — examine implementation details: packages modified, types/APIs consumed, files touched, build dependencies, and task descriptions.

For each candidate story, read its story file (or epic description if no story file exists) and determine: **does the current story depend on code, types, APIs, or infrastructure that the candidate story produces?**

### Examples of Real Dependencies

- Current story imports types that the candidate story defines
- Current story modifies a package that the candidate story creates
- Current story's tests use utilities that the candidate story implements
- Current story builds on APIs or interfaces introduced by the candidate story

### Examples That Are NOT Dependencies

- Stories touch different packages with no shared interfaces
- Stories work on independent features within the same package
- Sequential numbering alone (story 1-2 does not automatically require 1-1)

## Step 3: Record Blocking Dependencies

If any genuine blocking dependencies exist and are NOT `done`, add a `### Blocked By` section at the very beginning of the `## Dev Notes` section in the story file:

```markdown
## Dev Notes

### Blocked By
> **This story cannot start development until the following stories are completed:**
> - <story-key> (status: <current-status>)
>   Reason: <brief explanation of the code-level dependency>
```

Rules:
- List ONLY stories that are genuine dependencies AND are NOT `done`
- Include the full story key with current status in parentheses
- Include a brief reason explaining the dependency
- If there are NO real blocking dependencies, do NOT add this section

## Step 4: Check Dependencies Before Development (Consumer Side)

When starting development on a story, check for a `### Blocked By` section. If found:
- Look up the **current** status of each listed story (statuses may have changed since analysis ran)
- If ALL listed stories are now `done`, proceed — dependencies have been satisfied
- If any are still NOT `done`, halt and report which stories are still blocking

## Extension Points

**Issue tracker integration (optional):**
When recording dependencies, also update the external issue tracker (GitHub Issues, Jira, etc.) with dependency labels or links. This is tracker-specific and should be implemented by the orchestration layer, not by this template.

**Status notification (optional):**
When a blocking story is completed, notify dependent stories that they are now unblocked. This requires an event-driven system and is left to the orchestration layer.
