import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PLUGIN_ROOT = join(REPO_ROOT, 'bmad-github');
const SKILLS_ROOT = join(PLUGIN_ROOT, 'skills');

// Header BMad's installer expects (tools/installer/modules/module-help-schema.js).
const MODULE_HELP_CSV_HEADER =
  'module,skill,display-name,menu-code,description,action,args,phase,preceded-by,followed-by,required,output-location,outputs';

const skillDirs = readdirSync(SKILLS_ROOT)
  .filter((name) => statSync(join(SKILLS_ROOT, name)).isDirectory())
  .filter((name) => existsSync(join(SKILLS_ROOT, name, 'SKILL.md')));

function frontmatter(skill) {
  const content = readFileSync(join(SKILLS_ROOT, skill, 'SKILL.md'), 'utf-8');
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  return match ? match[1] : '';
}

function isShim(skill) {
  return /^\s+lifecycle:\s*shim\s*$/m.test(frontmatter(skill));
}

function filesUnder(dir) {
  return readdirSync(dir, { recursive: true })
    .map((rel) => join(dir, rel))
    .filter((path) => statSync(path).isFile());
}

function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else cell += ch;
  }
  cells.push(cell);
  return cells;
}

describe('skills are self-contained (BMad skill layout)', () => {
  it('finds the skills', () => {
    expect(skillDirs).toContain('bmad-github-story-build');
  });

  it.each(skillDirs)('%s: frontmatter name matches its directory', (skill) => {
    expect(frontmatter(skill)).toMatch(new RegExp(`^name: ${skill}$`, 'm'));
  });

  it.each(skillDirs)('%s: no Claude Code plugin-root paths', (skill) => {
    for (const file of filesUnder(join(SKILLS_ROOT, skill))) {
      expect(readFileSync(file, 'utf-8'), relative(REPO_ROOT, file)).not.toContain(
        'CLAUDE_PLUGIN_ROOT',
      );
    }
  });

  it.each(skillDirs)('%s: every ./ reference resolves inside the skill', (skill) => {
    const skillDir = join(SKILLS_ROOT, skill);
    for (const file of filesUnder(skillDir).filter((f) => f.endsWith('.md'))) {
      const content = readFileSync(file, 'utf-8');
      for (const [, ref] of content.matchAll(/`(\.\/[^`\s]+)`/g)) {
        const target = join(dirname(file), ref);
        expect(existsSync(target), `${relative(REPO_ROOT, file)} -> ${ref}`).toBe(true);
        expect(target.startsWith(skillDir), `${ref} leaves ${skill}`).toBe(true);
      }
    }
  });
});

describe('no file is duplicated across skills', () => {
  it('every file content is unique to one skill', () => {
    const owners = new Map();
    for (const skill of skillDirs) {
      for (const file of filesUnder(join(SKILLS_ROOT, skill))) {
        const content = readFileSync(file, 'utf-8');
        const other = owners.get(content);
        expect(
          other === undefined || other.skill === skill,
          `${relative(REPO_ROOT, file)} duplicates ${other && relative(REPO_ROOT, other.file)}; ` +
            'move the shared steps into their own skill and invoke it',
        ).toBe(true);
        owners.set(content, { skill, file });
      }
    }
  });
});

describe('module-help.csv', () => {
  const lines = readFileSync(join(SKILLS_ROOT, 'module-help.csv'), 'utf-8').trim().split('\n');
  const rows = lines.slice(1).map(parseCsvLine);

  it('uses the header BMad expects', () => {
    expect(lines[0]).toBe(MODULE_HELP_CSV_HEADER);
  });

  it('has 13 cells per row', () => {
    for (const row of rows) expect(row, row[1]).toHaveLength(13);
  });

  it('lists every active skill, and no deprecated skill', () => {
    const listed = rows.map((row) => row[1]).sort();
    const active = skillDirs.filter((skill) => !isShim(skill)).sort();
    expect(listed).toEqual(active);
  });

  it('has unique menu codes', () => {
    const codes = rows.map((row) => row[3]);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('deprecated skills follow the BMad shim convention', () => {
  it.each(skillDirs.filter(isShim))('%s: description starts with "Deprecated"', (skill) => {
    expect(frontmatter(skill)).toMatch(/^description: ["']Deprecated: /m);
  });
});

describe('version numbers', () => {
  it('match across marketplace.json, plugin.json and module.yaml', () => {
    const marketplace = JSON.parse(
      readFileSync(join(REPO_ROOT, '.claude-plugin/marketplace.json'), 'utf-8'),
    );
    const plugin = JSON.parse(
      readFileSync(join(PLUGIN_ROOT, '.claude-plugin/plugin.json'), 'utf-8'),
    );
    const moduleYaml = readFileSync(join(SKILLS_ROOT, 'module.yaml'), 'utf-8');
    const moduleVersion = moduleYaml.match(/^version:\s*"?([^"\n]+)"?$/m)?.[1];
    expect(plugin.version).toBe(marketplace.plugins[0].version);
    expect(moduleVersion).toBe(plugin.version);
  });
});
