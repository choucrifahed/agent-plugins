# Development Guide

## Prerequisites

- [Node.js](https://nodejs.org/) (for scripts and tests)
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
```

Run a specific test file:
```bash
npx vitest run tests/bmad-github/sync-stories-to-github.test.mjs
```

## Linting & Formatting

This project uses [Biome](https://biomejs.dev/) for linting and formatting. It only checks
JavaScript/ESM files in `bmad-github/scripts/` and `tests/`.

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
| `bmad-github/module.yaml` | `version` |

When releasing a new version, update all three files to the same semver value.

## Project Structure

```
agent-plugins/
├── .claude-plugin/
│   └── marketplace.json          # Marketplace manifest (plugin registry)
├── bmad-github/                  # The bmad-github plugin (also a BMAD v6.6+ module)
│   ├── .claude-plugin/
│   │   └── plugin.json           # Claude Code plugin manifest
│   ├── module.yaml               # BMAD module manifest
│   ├── module-help.csv           # BMAD help entries (SI/SC/SD/SR/SS/SCI)
│   ├── skills/                   # Six story-lifecycle skills (canonical content)
│   │   ├── bmad-github-story-init/SKILL.md
│   │   ├── bmad-github-story-create/SKILL.md
│   │   ├── bmad-github-story-dev/SKILL.md
│   │   ├── bmad-github-story-review/SKILL.md
│   │   ├── bmad-github-story-sync/SKILL.md
│   │   └── bmad-github-story-setup-ci/SKILL.md
│   ├── references/               # Shared instructions (workflow loader, sync helper, etc.)
│   ├── hooks/                    # Event hooks
│   │   ├── hooks.json            # Hook configuration
│   │   └── scripts/
│   │       └── session-start.sh  # Injects BMAD output folder convention
│   └── scripts/
│       └── sync-stories-to-github.mjs  # Batch sync script (Node.js)
├── tests/
│   └── bmad-github/
│       └── sync-stories-to-github.test.mjs
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
