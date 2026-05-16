# Resolve Worktree Root

Determine where worktrees are stored for this project (first match wins):

1. **Check for a local config override:**
   Read `.claude/bmad-github.local.md` if it exists. Look for a `worktree-root` field in the YAML frontmatter.

2. **Check BMAD install config** (set during `npx bmad-method install`, first hit wins):
   - **v6.4+ central config:** read `_bmad/config.toml` and look for `worktree_root` under `[modules.bmad-github]`. This honors any user override placed in `_bmad/custom/config.toml` or `_bmad/custom/config.user.toml`.
   - **Per-module fallback:** if `_bmad/config.toml` is absent or has no `[modules.bmad-github] worktree_root`, read `_bmad/bmad-github/config.yaml` (installer-managed mirror) for a top-level `worktree_root` key. This covers older BMAD installs and cases where the central TOML hasn't been regenerated yet.

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
