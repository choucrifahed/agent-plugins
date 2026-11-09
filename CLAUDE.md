# Agent instructions

Human-facing setup, testing and release steps are in `DEVELOPMENT.md`.

## Editing skills in `bmad-github/skills/`

- Keep each skill folder self-contained. BMad's skill rules forbid a skill from reading another skill's files, and
  BMad's installer copies each skill folder on its own.
- Never copy a file between skills. When two skills need the same steps, put them in their own skill and have both
  invoke it, e.g. "Invoke the `bmad-github-story-open-pr` skill". `tests/bmad-github/skills.test.mjs` fails if any file
  is duplicated across skills.
