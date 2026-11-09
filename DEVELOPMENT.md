# Development Guide

## Prerequisites

- [Node.js](https://nodejs.org/) v22.12+ (for scripts and tests; Vitest 5 requires it, CI runs Node 26)
- [`uv`](https://docs.astral.sh/uv/) (to run BMad's skill validator and to try the module in a BMad project)
## Setup

```bash
npm install
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm test` | Run tests once (vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run check` | Run linter and formatter (biome) |

## Testing

Tests live in `tests/` mirroring the plugin structure:

```
tests/
  bmad-github/
    sync-stories-to-github.test.mjs   # Tests for the batch sync script
    skills.test.mjs                   # Skill layout, no duplicated files, module-help.csv, versions
```

Run a specific test file:
```bash
npx vitest run tests/bmad-github/sync-stories-to-github.test.mjs
```

### BMad skill validator

BMad ships a deterministic skill validator. Run it against each skill before a release:

```bash
npm pack bmad-method@<version> && tar xzf bmad-method-<version>.tgz
for d in bmad-github/skills/*/; do uv run --python 3.11 package/tools/validate_skills.py --strict "$d"; done
```

### Try the module in a BMad project

```bash
npx bmad-method install --directory /tmp/demo --modules bmm \
  --custom-source "$PWD/bmad-github/skills" --tools claude-code --yes
```

Add `--shims` to also install the deprecated skills (`bmad-github-story-create`, `bmad-github-story-dev`).

## Linting & Formatting

This project uses [Biome](https://biomejs.dev/) for linting and formatting. It only checks
JavaScript/ESM files under `bmad-github/skills/` and `tests/`.

Configuration: `biome.json`
- Indent: 2 spaces
- Line width: 100
- Single quotes, trailing commas, semicolons

To auto-fix:
```bash
npx biome check --write .
```

## Version Numbers

The version must be consistent across all three files:

| File | Field |
|------|-------|
| `.claude-plugin/marketplace.json` | `plugins[0].version` |
| `bmad-github/.claude-plugin/plugin.json` | `version` |
| `bmad-github/skills/module.yaml` | `version` |

When releasing a new version, update all three files to the same semver value. `skills.test.mjs` checks that they match.

## Project Structure

```
agent-plugins/
├── .claude-plugin/
│   └── marketplace.json          # Marketplace manifest (plugin registry)
├── bmad-github/                  # The bmad-github plugin (also a BMAD module)
│   ├── .claude-plugin/
│   │   └── plugin.json           # Claude Code plugin manifest
│   └── skills/                   # Claude Code skills dir AND the BMAD module source (--custom-source)
│       ├── module.yaml           # BMAD module manifest
│       ├── module-help.csv       # BMAD help entries (SI/SB/SPR/SR/SY/SCI)
│       ├── bmad-github-story-init/
│       │   ├── SKILL.md
│       │   └── scripts/sync-stories-to-github.mjs   # Batch sync script (Node.js)
│       ├── bmad-github-story-build/SKILL.md
│       ├── bmad-github-story-open-pr/SKILL.md       # push + PR, invoked by Story Build and Story Dev
│       ├── bmad-github-story-review/SKILL.md
│       ├── bmad-github-story-sync/SKILL.md
│       ├── bmad-github-story-setup-ci/
│       │   ├── SKILL.md
│       │   └── assets/bmad-story-sync.yml           # GitHub Actions template
│       ├── bmad-github-story-create/SKILL.md        # deprecated (lifecycle: shim)
│       └── bmad-github-story-dev/SKILL.md           # deprecated (lifecycle: shim)
├── tests/
│   └── bmad-github/
├── package.json
├── biome.json
├── README.md                     # User-facing documentation
└── DEVELOPMENT.md                # This file
```

## Adding a New Plugin

1. Create a new directory at the repo root (e.g., `my-plugin/`)
2. Add `.claude-plugin/plugin.json` with at least a `name` field
3. Add commands, agents, skills, or hooks as needed
4. Register it in `.claude-plugin/marketplace.json` under `plugins`
5. Add tests in `tests/my-plugin/`
6. Update `biome.json` `files.includes` if the plugin has JavaScript files
