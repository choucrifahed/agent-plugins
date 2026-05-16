# BMAD Operation Runner

Run the BMAD operation named `<operation>` (for example: `create-story`, `dev-story`, `code-review`).

BMAD ships each operation in one of several forms depending on the installed version — most commonly a Claude Code skill (named something like `bmad-<operation>`) or a `workflow.yaml` somewhere under `_bmad/`. Layouts and naming change between BMAD releases, so do **not** assume a specific path or structure.

<steps CRITICAL="TRUE">
1. Discover how `<operation>` is provided in this project. Likely places to check:
   - The available Claude Code skills list (look for one matching `bmad-<operation>` or close).
   - Files under `_bmad/` (for example, a `workflow.yaml` whose folder or `name:` matches `<operation>`).
2. Run whichever form you found, following its own conventions:
   - If it is a skill, invoke that skill.
   - If it is a `workflow.yaml`, load it via the BMAD workflow engine bundled with that BMAD version (older releases drive workflows through `_bmad/core/tasks/workflow.xml` with the yaml passed as `workflow-config`; newer releases may expose a different runner — read what is actually present and follow it).
3. If both forms exist, prefer the one the installed BMAD version is documented to use; if unsure, prefer the skill.
4. If nothing matching `<operation>` can be found, stop and tell the user that BMAD's `<operation>` is not installed in this project.
5. Save outputs after each section when generating documents from templates.
</steps>

**Why so little detail:** BMAD reorganizes its module layout between releases. Hardcoding a path here breaks the plugin every time BMAD moves things. The operation name is the only stable contract — the agent resolves the rest from what is actually on disk.