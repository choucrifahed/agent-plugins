import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock child_process before importing the module under test
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import {
  buildIssueBody,
  classifyStory,
  gh,
  parseDoneStories,
  parseEpics,
} from '../../bmad-github/scripts/sync-stories-to-github.mjs';

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
    const yaml = [
      'sprint-1:',
      '  1-1-setup-project: done',
      '  2-1: done',
    ].join('\n');
    const done = parseDoneStories(yaml);
    expect(done).toEqual(new Set(['1-1', '2-1']));
  });

  it('returns empty set for empty content', () => {
    expect(parseDoneStories('').size).toBe(0);
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
    expect(() => gh(['api', 'repos/{owner}/{repo}/milestones'], { json: true, readOnly: true }))
      .toThrow(/Failed to parse JSON/);
    expect(() => gh(['api', 'repos/{owner}/{repo}/milestones'], { json: true, readOnly: true }))
      .toThrow(/502 Bad Gateway/);
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
