#!/bin/bash
# Inject BMAD output folder resolution convention into every session.
# All bmad-github commands reference <output_folder> — this hook tells
# the AI how to resolve it.

cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "## bmad-github: BMAD Output Folder Convention\n\nAll bmad-github commands reference paths using `<output_folder>`. At the start of any bmad-github command, resolve it ONCE:\n\n1. Read `_bmad/bmm/config.yaml` if it exists\n2. Look for the `output_folder` key (e.g., `output_folder: docs` or `output_folder: \"{project-root}/docs\"`)\n3. If found, resolve `{project-root}` to the repo root and use it as `<output_folder>`\n4. If not found, default to `_bmad-output`\n\nSubstitute the resolved value wherever `<output_folder>` appears in command instructions."
  }
}
EOF
