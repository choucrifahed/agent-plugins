import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock child_process before importing the module under test
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildIssueBody,
  buildMilestoneMap,
  classifyStory,
  fetchMilestones,
  gh,
  parseDoneStories,
  parseEpics,
  parseFrontmatterStatus,
  resolveBmadPaths,
  runResolveConfig,
  toAbsolutePath,
} from '../../bmad-github/skills/bmad-github-story-init/scripts/sync-stories-to-github.mjs';

// ---------------------------------------------------------------------------
// parseEpics
// ---------------------------------------------------------------------------

describe('parseEpics', () => {
  it('parses a single epic', () => {
    const { epics, stories } = parseEpics('## Epic 1: Setup');
    expect(epics).toEqual([{ number: 1, title: 'Setup' }]);
    expect(stories).toEqual([]);
  });

  it('parses multiple epics', () => {
    const content = ['## Epic 1: Setup', '## Epic 2: Core Features'].join('\n');
    const { epics } = parseEpics(content);
    expect(epics).toHaveLength(2);
    expect(epics[0]).toEqual({ number: 1, title: 'Setup' });
    expect(epics[1]).toEqual({ number: 2, title: 'Core Features' });
  });

  it('deduplicates epics when ## and ### variants both appear', () => {
    const content = ['## Epic 1: Setup', '### Epic 1: Setup'].join('\n');
    const { epics } = parseEpics(content);
    expect(epics).toHaveLength(1);
  });

  it('parses a story with epic/story numbers and key', () => {
    const content = ['## Epic 2: Core', '### Story 2.3: Build the widget'].join('\n');
    const { stories } = parseEpics(content);
    expect(stories).toHaveLength(1);
    expect(stories[0]).toMatchObject({
      epicNumber: 2,
      storyNumber: 3,
      key: '2-3',
      title: 'Build the widget',
    });
  });

  it('assigns stories to the correct epic context', () => {
    const content = [
      '## Epic 1: Alpha',
      '### Story 1.1: First',
      '## Epic 2: Beta',
      '### Story 2.1: Second',
    ].join('\n');
    const { stories } = parseEpics(content);
    expect(stories[0].epicNumber).toBe(1);
    expect(stories[1].epicNumber).toBe(2);
  });

  it('extracts plain user story lines', () => {
    const content = [
      '## Epic 1: X',
      '### Story 1.1: Y',
      'As a developer',
      'I want to test my code',
      'So that I catch bugs early',
    ].join('\n');
    const { stories } = parseEpics(content);
    expect(stories[0].userStory).toEqual([
      'As a developer',
      'I want to test my code',
      'So that I catch bugs early',
    ]);
  });

  it('extracts bold user story lines', () => {
    const content = [
      '## Epic 1: X',
      '### Story 1.1: Y',
      '**As a** developer',
      '**I want** to test',
      '**So that** I catch bugs',
    ].join('\n');
    const { stories } = parseEpics(content);
    expect(stories[0].userStory).toHaveLength(3);
  });

  it('extracts acceptance criteria with Given/When/Then', () => {
    const content = [
      '## Epic 1: X',
      '### Story 1.1: Y',
      '**Acceptance Criteria**',
      '**Given** the system is running',
      '**When** I click submit',
      '**Then** I see a confirmation',
    ].join('\n');
    const { stories } = parseEpics(content);
    const ac = stories[0].acceptanceCriteria;
    expect(ac).toHaveLength(1);
    expect(ac[0]).toContain('**Given**');
    expect(ac[0]).toContain('**When**');
    expect(ac[0]).toContain('**Then**');
  });

  it('groups multiple acceptance criteria separately', () => {
    const content = [
      '## Epic 1: X',
      '### Story 1.1: Y',
      '**Acceptance Criteria**',
      '**Given** A',
      '**Then** B',
      '**Given** C',
      '**Then** D',
    ].join('\n');
    const { stories } = parseEpics(content);
    expect(stories[0].acceptanceCriteria).toHaveLength(2);
  });

  it('handles When/Then without a preceding Given', () => {
    const content = [
      '## Epic 1: X',
      '### Story 1.1: Y',
      '**Acceptance Criteria**',
      '**When** something happens',
    ].join('\n');
    const { stories } = parseEpics(content);
    expect(stories[0].acceptanceCriteria).toHaveLength(1);
    expect(stories[0].acceptanceCriteria[0]).toContain('**When**');
  });

  it('recognises #### Acceptance Criteria heading', () => {
    const content = [
      '## Epic 1: X',
      '### Story 1.1: Y',
      '#### Acceptance Criteria',
      '**Given** Z',
    ].join('\n');
    const { stories } = parseEpics(content);
    expect(stories[0].acceptanceCriteria).toHaveLength(1);
  });

  it('resets acceptance criteria collection on next heading', () => {
    const content = [
      '## Epic 1: X',
      '### Story 1.1: Y',
      '**Acceptance Criteria**',
      '**Given** A',
      '## Epic 2: Z',
      '**Given** should not attach to story 1.1',
    ].join('\n');
    const { stories } = parseEpics(content);
    expect(stories[0].acceptanceCriteria).toHaveLength(1);
  });

  it('extracts FR references', () => {
    const content = ['## Epic 1: X', '### Story 1.1: Y', '**FRs covered:** FR-1, FR-2'].join('\n');
    const { stories } = parseEpics(content);
    expect(stories[0].frs).toEqual(['FR-1, FR-2']);
  });

  it('extracts Functional Requirements variant', () => {
    const content = ['## Epic 1: X', '### Story 1.1: Y', '**Functional Requirements:** FR-3'].join(
      '\n',
    );
    const { stories } = parseEpics(content);
    expect(stories[0].frs).toEqual(['FR-3']);
  });

  it('extracts NFR references', () => {
    const content = ['## Epic 1: X', '### Story 1.1: Y', '**NFRs addressed:** NFR-1'].join('\n');
    const { stories } = parseEpics(content);
    expect(stories[0].nfrs).toEqual(['NFR-1']);
  });

  it('returns empty arrays for empty content', () => {
    const { epics, stories } = parseEpics('');
    expect(epics).toEqual([]);
    expect(stories).toEqual([]);
  });

  it('returns empty arrays for content with no matching headers', () => {
    const { epics, stories } = parseEpics('# Just a title\nSome body text.');
    expect(epics).toEqual([]);
    expect(stories).toEqual([]);
  });

  it('flushes the last story at end of input', () => {
    const content = ['## Epic 1: X', '### Story 1.1: First', '### Story 1.2: Second'].join('\n');
    const { stories } = parseEpics(content);
    expect(stories).toHaveLength(2);
    expect(stories[1].title).toBe('Second');
  });

  it('flushes in-progress story when a new epic starts', () => {
    const content = ['## Epic 1: X', '### Story 1.1: Only story', 'As a user', '## Epic 2: Y'].join(
      '\n',
    );
    const { stories } = parseEpics(content);
    expect(stories).toHaveLength(1);
    expect(stories[0].userStory).toEqual(['As a user']);
  });
});

// ---------------------------------------------------------------------------
// parseDoneStories
// ---------------------------------------------------------------------------

describe('parseDoneStories', () => {
  it('extracts done story keys', () => {
    const yaml = [
      'sprint-1:',
      '  stories:',
      '  1-1-setup-project: done',
      '  1-2-add-auth: in-progress',
      '  2-1-build-ui: done',
    ].join('\n');
    const done = parseDoneStories(yaml);
    expect(done).toEqual(new Set(['1-1', '2-1']));
  });

  it('returns empty set for content with no done stories', () => {
    const yaml = ['sprint-1:', '  1-1-setup: in-progress'].join('\n');
    const done = parseDoneStories(yaml);
    expect(done.size).toBe(0);
  });

  it('extracts bare-key done stories (no slug)', () => {
    const yaml = [
      'sprint-1:',
      '  stories:',
      '  1-1: done',
      '  2-1: done',
      '  1-2: in-progress',
    ].join('\n');
    const done = parseDoneStories(yaml);
    expect(done).toEqual(new Set(['1-1', '2-1']));
  });

  it('handles mixed bare-key and slug formats', () => {
    const yaml = ['sprint-1:', '  1-1-setup-project: done', '  2-1: done'].join('\n');
    const done = parseDoneStories(yaml);
    expect(done).toEqual(new Set(['1-1', '2-1']));
  });

  it('returns empty set for empty content', () => {
    expect(parseDoneStories('').size).toBe(0);
  });

  it('ignores retrospective action_items entries (BMad 6.9+)', () => {
    const yaml = [
      'development_status:',
      '  epic-1: done',
      '  1-1-setup-project: done',
      '  1-2-add-auth: review',
      'action_items:',
      '  - epic: 1',
      '    action: "Add error-handling review to the checklist"',
      '    owner: "Charlie"',
      '    status: done',
    ].join('\n');
    expect(parseDoneStories(yaml)).toEqual(new Set(['1-1']));
  });

  it('requires leading whitespace (rejects top-level lines)', () => {
    const done = parseDoneStories('1-1-setup: done');
    expect(done.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// classifyStory
// ---------------------------------------------------------------------------

describe('classifyStory', () => {
  const story = (title) => ({ title });

  it('classifies documentation stories', () => {
    expect(classifyStory(story('Project Documentation'))).toBe('documentation');
    expect(classifyStory(story('Developer Onboarding Guide'))).toBe('documentation');
  });

  it('classifies CI/CD stories', () => {
    expect(classifyStory(story('Build Pipeline'))).toBe('github_actions');
    expect(classifyStory(story('Release Automation Setup'))).toBe('github_actions');
    expect(classifyStory(story('NPM Publishing'))).toBe('github_actions');
  });

  it('classifies QA stories (validation without exclusions)', () => {
    expect(classifyStory(story('Input Validation Gates'))).toBe('qa');
  });

  it('does not classify as QA when exclusion words present', () => {
    expect(classifyStory(story('Standalone Validation'))).toBe('enhancement');
    expect(classifyStory(story('Editor Validation'))).toBe('enhancement');
    expect(classifyStory(story('Sync Validation'))).toBe('enhancement');
  });

  it('classifies dependency/tooling stories', () => {
    expect(classifyStory(story('Scaffold Tooling and Linting'))).toBe('dependencies');
  });

  it('requires both scaffold AND tooling/linting for dependencies', () => {
    expect(classifyStory(story('Scaffold the project'))).toBe('enhancement');
    expect(classifyStory(story('Setup Linting'))).toBe('enhancement');
  });

  it('defaults to enhancement', () => {
    expect(classifyStory(story('Build the new feature'))).toBe('enhancement');
    expect(classifyStory(story('Add user profiles'))).toBe('enhancement');
  });

  it('is case-insensitive', () => {
    expect(classifyStory(story('DOCUMENTATION update'))).toBe('documentation');
    expect(classifyStory(story('release AUTOMATION'))).toBe('github_actions');
  });
});

// ---------------------------------------------------------------------------
// buildIssueBody
// ---------------------------------------------------------------------------

describe('buildIssueBody', () => {
  const baseStory = () => ({
    userStory: [],
    acceptanceCriteria: [],
    frs: [],
    nfrs: [],
  });

  it('includes user story section when present', () => {
    const story = { ...baseStory(), userStory: ['As a dev', 'I want tests'] };
    const body = buildIssueBody(story);
    expect(body).toContain('## User Story');
    expect(body).toContain('As a dev');
    expect(body).toContain('I want tests');
  });

  it('omits user story section when empty', () => {
    const body = buildIssueBody(baseStory());
    expect(body).not.toContain('## User Story');
  });

  it('renders acceptance criteria as checkboxes', () => {
    const story = {
      ...baseStory(),
      acceptanceCriteria: ['**Given** X\n**Then** Y', '**Given** A'],
    };
    const body = buildIssueBody(story);
    expect(body).toContain('## Acceptance Criteria');
    expect(body).toContain('- [ ] **Given** X\n**Then** Y');
    expect(body).toContain('- [ ] **Given** A');
  });

  it('omits acceptance criteria section when empty', () => {
    const body = buildIssueBody(baseStory());
    expect(body).not.toContain('## Acceptance Criteria');
  });

  it('includes FRs and NFRs', () => {
    const story = { ...baseStory(), frs: ['FR-1', 'FR-2'], nfrs: ['NFR-1'] };
    const body = buildIssueBody(story);
    expect(body).toContain('**FRs:** FR-1, FR-2');
    expect(body).toContain('**NFRs:** NFR-1');
  });

  it('omits FR/NFR lines when empty', () => {
    const body = buildIssueBody(baseStory());
    expect(body).not.toContain('**FRs:**');
    expect(body).not.toContain('**NFRs:**');
  });

  it('always includes the footer', () => {
    const body = buildIssueBody(baseStory());
    expect(body).toContain('---');
    expect(body).toContain('_Synced from BMAD epics.md_');
  });

  it('produces consistent spacing (no double blank lines)', () => {
    const story = {
      ...baseStory(),
      userStory: ['As a user'],
      acceptanceCriteria: ['**Given** X'],
      frs: ['FR-1'],
    };
    const body = buildIssueBody(story);
    expect(body).not.toContain('\n\n\n');
  });
});

// ---------------------------------------------------------------------------
// gh (with mocked execFileSync)
// ---------------------------------------------------------------------------

describe('gh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes args array directly to execFileSync', () => {
    execFileSync.mockReturnValue('ok');
    gh(['issue', 'list', '--state', 'all']);
    expect(execFileSync).toHaveBeenCalledWith(
      'gh',
      ['issue', 'list', '--state', 'all'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });

  it('returns trimmed string output by default', () => {
    execFileSync.mockReturnValue('  https://github.com/org/repo/issues/42  ');
    const result = gh(['issue', 'create', '--title', 'test']);
    expect(result).toBe('https://github.com/org/repo/issues/42');
  });

  it('parses JSON when json option is true', () => {
    execFileSync.mockReturnValue('[{"number":1}]');
    const result = gh(['issue', 'list'], { json: true, readOnly: true });
    expect(result).toEqual([{ number: 1 }]);
  });

  it('returns null for empty JSON output', () => {
    execFileSync.mockReturnValue('');
    const result = gh(['issue', 'list'], { json: true, readOnly: true });
    expect(result).toBeNull();
  });

  it('returns null for whitespace-only JSON output', () => {
    execFileSync.mockReturnValue('   ');
    const result = gh(['issue', 'list'], { json: true, readOnly: true });
    expect(result).toBeNull();
  });

  it('throws on command failure with descriptive message', () => {
    execFileSync.mockImplementation(() => {
      const err = new Error('exit code 1');
      err.stderr = 'HTTP 404: Not Found';
      throw err;
    });
    expect(() => gh(['issue', 'view', '999'])).toThrow(/gh command failed/);
    expect(() => gh(['issue', 'view', '999'])).toThrow(/HTTP 404/);
  });

  it('returns null on failure when ignoreError is true (json mode)', () => {
    execFileSync.mockImplementation(() => {
      throw new Error('fail');
    });
    const result = gh(['issue', 'view', '999'], { json: true, ignoreError: true });
    expect(result).toBeNull();
  });

  it('returns empty string on failure when ignoreError is true (text mode)', () => {
    execFileSync.mockImplementation(() => {
      throw new Error('fail');
    });
    const result = gh(['issue', 'view', '999'], { ignoreError: true });
    expect(result).toBe('');
  });

  it('passes input option to execFileSync for stdin piping', () => {
    execFileSync.mockReturnValue('https://github.com/org/repo/issues/1');
    gh(['issue', 'create', '--body-file', '-'], { input: 'body content' });
    expect(execFileSync).toHaveBeenCalledWith(
      'gh',
      ['issue', 'create', '--body-file', '-'],
      expect.objectContaining({ input: 'body content' }),
    );
  });

  it('throws descriptive error when JSON parsing fails', () => {
    execFileSync.mockReturnValue('<html>502 Bad Gateway</html>');
    expect(() =>
      gh(['api', 'repos/{owner}/{repo}/milestones'], { json: true, readOnly: true }),
    ).toThrow(/Failed to parse JSON/);
    expect(() =>
      gh(['api', 'repos/{owner}/{repo}/milestones'], { json: true, readOnly: true }),
    ).toThrow(/502 Bad Gateway/);
  });

  it('handles JSON objects (not just arrays)', () => {
    execFileSync.mockReturnValue('{"number":42,"url":"https://example.com"}');
    const result = gh(['issue', 'view', '42', '--json', 'number,url'], {
      json: true,
      readOnly: true,
    });
    expect(result).toEqual({ number: 42, url: 'https://example.com' });
  });
});

// ---------------------------------------------------------------------------
// BMad config resolution
// ---------------------------------------------------------------------------

describe('toAbsolutePath', () => {
  it('substitutes {project-root}', () => {
    expect(toAbsolutePath('{project-root}/_bmad-output/planning-artifacts', '/repo')).toBe(
      '/repo/_bmad-output/planning-artifacts',
    );
  });

  it('joins relative values onto the root', () => {
    expect(toAbsolutePath('docs/artifacts', '/repo')).toBe('/repo/docs/artifacts');
  });

  it('keeps absolute values', () => {
    expect(toAbsolutePath('/elsewhere/artifacts', '/repo')).toBe('/elsewhere/artifacts');
  });
});

describe('resolveBmadPaths', () => {
  it('resolves both artifact folders from the merged config', () => {
    const resolveConfig = () => ({
      'modules.bmm.planning_artifacts': '{project-root}/_bmad-output/planning-artifacts',
      'modules.bmm.implementation_artifacts': '{project-root}/custom/impl',
    });
    expect(resolveBmadPaths('/repo', { resolveConfig })).toEqual({
      planningArtifacts: '/repo/_bmad-output/planning-artifacts',
      implementationArtifacts: '/repo/custom/impl',
    });
  });

  it('throws when the bmm module is not configured', () => {
    const resolveConfig = () => ({ 'modules.bmm.planning_artifacts': '{project-root}/plan' });
    expect(() => resolveBmadPaths('/repo', { resolveConfig })).toThrow(
      /modules\.bmm\.implementation_artifacts/,
    );
  });
});

describe('runResolveConfig', () => {
  let tempDir;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), 'bmad-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function installResolver() {
    mkdirSync(join(tempDir, '_bmad/scripts'), { recursive: true });
    writeFileSync(join(tempDir, '_bmad/scripts/resolve_config.py'), '');
  }

  it('throws a clear error when BMad is not installed', () => {
    expect(() => runResolveConfig(tempDir)).toThrow(/resolve_config\.py/);
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('runs BMad resolver through uv with the needed keys', () => {
    installResolver();
    execFileSync.mockReturnValue('{"modules.bmm.planning_artifacts": "x"}');
    expect(runResolveConfig(tempDir)).toEqual({ 'modules.bmm.planning_artifacts': 'x' });
    expect(execFileSync).toHaveBeenCalledWith(
      'uv',
      [
        'run',
        join(tempDir, '_bmad/scripts/resolve_config.py'),
        '--project-root',
        tempDir,
        '--key',
        'modules.bmm.planning_artifacts',
        '--key',
        'modules.bmm.implementation_artifacts',
      ],
      expect.any(Object),
    );
  });

  it('explains how to install uv when it is missing', () => {
    installResolver();
    execFileSync.mockImplementation(() => {
      throw Object.assign(new Error('spawn uv ENOENT'), { code: 'ENOENT' });
    });
    expect(() => runResolveConfig(tempDir)).toThrow(/uv` is not installed/);
  });

  it('surfaces resolver failures', () => {
    installResolver();
    execFileSync.mockImplementation(() => {
      throw Object.assign(new Error('exit 1'), { stderr: 'error: required config file not found' });
    });
    expect(() => runResolveConfig(tempDir)).toThrow(/required config file not found/);
  });
});

describe('parseFrontmatterStatus', () => {
  it('reads a quoted or bare status', () => {
    expect(parseFrontmatterStatus("---\nstatus: 'draft'\n---\n# Epics")).toBe('draft');
    expect(parseFrontmatterStatus('---\ntitle: x\nstatus: final\n---\n')).toBe('final');
  });

  it('ignores trailing comments', () => {
    expect(parseFrontmatterStatus('---\nstatus: draft # draft | final\n---\n')).toBe('draft');
  });

  it('returns null without frontmatter or status', () => {
    expect(parseFrontmatterStatus('# Epics\nstatus: draft')).toBeNull();
    expect(parseFrontmatterStatus('---\ntitle: x\n---\n')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fetchMilestones — regression for `gh api --paginate --slurp` array-of-arrays
// ---------------------------------------------------------------------------

describe('fetchMilestones', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flattens a single empty page ([[]] -> [])', () => {
    execFileSync.mockReturnValue('[[]]');
    expect(fetchMilestones()).toEqual([]);
  });

  it('flattens a single page with one item', () => {
    execFileSync.mockReturnValue('[[{"title":"Epic 1: x"}]]');
    expect(fetchMilestones()).toEqual([{ title: 'Epic 1: x' }]);
  });

  it('flattens multiple pages into a single array', () => {
    execFileSync.mockReturnValue(
      '[[{"title":"Epic 1: a"},{"title":"Epic 2: b"}],[{"title":"Epic 3: c"}]]',
    );
    const result = fetchMilestones();
    expect(result).toHaveLength(3);
    expect(result.map((m) => m.title)).toEqual(['Epic 1: a', 'Epic 2: b', 'Epic 3: c']);
  });

  it('throws a descriptive error when the API does not return an array', () => {
    execFileSync.mockReturnValue('{"message":"Not Found"}');
    expect(() => fetchMilestones()).toThrow(/Expected array of milestones/);
  });
});

// ---------------------------------------------------------------------------
// buildMilestoneMap — derives mapping from parsed epics, not from gh API
// ---------------------------------------------------------------------------

describe('buildMilestoneMap', () => {
  it('returns an empty map for no epics', () => {
    expect(buildMilestoneMap([])).toEqual(new Map());
  });

  it('maps epic number to the deterministic milestone title', () => {
    const epics = [
      { number: 1, title: 'Setup' },
      { number: 2, title: 'Core Features' },
    ];
    const map = buildMilestoneMap(epics);
    expect(map.get(1)).toBe('Epic 1: Setup');
    expect(map.get(2)).toBe('Epic 2: Core Features');
    expect(map.size).toBe(2);
  });

  it('produces titles that match createMilestones output, so issue creation can attach them on first run', () => {
    // Regression for Bug 2: the previous implementation built the map from a
    // pre-creation fetch of milestones, which was empty on a clean repo and
    // caused every issue to be created without a milestone.
    const epics = [{ number: 7, title: 'Something' }];
    const expected = `Epic ${epics[0].number}: ${epics[0].title}`;
    expect(buildMilestoneMap(epics).get(7)).toBe(expected);
  });
});
