# Sync First

Run the full `/story-sync` logic to catch up on any merged PRs before proceeding.
This ensures sprint-status.yaml is current.

Specifically, execute the same steps as the story-sync command:
1. Verify on main branch, pull latest
2. Read issue map and sprint-status.yaml
3. Query GitHub for closed issues
4. Sync any closed issues → BMAD done
5. Clean up completed worktrees
6. Commit sync changes if any

If sync made changes, push them before proceeding.
