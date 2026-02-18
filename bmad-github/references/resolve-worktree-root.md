# Resolve Worktree Root

Determine where worktrees are stored for this project (first match wins):

1. **Check for a local config override:**
   Read `.claude/bmad-github.local.md` if it exists. Look for a `worktree-root` field in the YAML frontmatter.

2. **Check BMAD install config:**
   If no local override, read `_bmad/bmm/config.yaml` and look for a `worktree_root` key (set during `npx bmad-method install`).

3. **Auto-detect:**
   ```
   basename $(git rev-parse --show-toplevel)
   ```
   The default worktree root is `../<repo-name>-worktrees/` relative to the repo root.

Store the resolved path as `<worktree-root>`.

4. **Persist the config if it doesn't exist:**
   If `.claude/bmad-github.local.md` did NOT already exist, create it now with the resolved worktree root so future runs skip auto-detection:
   ```markdown
   ---
   worktree-root: <worktree-root>
   ---
   ```
