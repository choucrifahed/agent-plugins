#!/usr/bin/env node

/**
 * Batch sync: Parse epics.md and create GitHub Milestones, Labels, and Issues.
 *
 * Usage:
 *   node scripts/sync-stories-to-github.mjs [--dry-run]
 *
 * Prerequisites:
 *   - `gh` CLI installed and authenticated
 *   - Run from the repository root
 *
 * Idempotent: safe to re-run. Checks for existing milestones/issues before creating.
 * Saves mapping to _bmad-output/implementation-artifacts/github-issue-map.json
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = process.cwd();
const EPICS_PATH = join(ROOT, '_bmad-output/planning-artifacts/epics.md');
const SPRINT_STATUS_PATH = join(ROOT, '_bmad-output/implementation-artifacts/sprint-status.yaml');
const MAP_PATH = join(ROOT, '_bmad-output/implementation-artifacts/github-issue-map.json');

// --- Helpers -----------------------------------------------------------

/**
 * Run a `gh` CLI command. Args must be an array — no string interpolation,
 * no shell interpretation, no quoting hazards.
 */
function gh(argList, { json = false, ignoreError = false, readOnly = false, input } = {}) {
  const desc = argList.join(' ');

  if (DRY_RUN && !readOnly) {
    console.log(`[dry-run] gh ${desc}`);
    return json ? null : '';
  }
  try {
    const out = execFileSync('gh', argList, {
      encoding: 'utf-8',
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return json ? (out ? JSON.parse(out) : null) : out;
  } catch (err) {
    if (ignoreError) return json ? null : '';
    throw new Error(`gh command failed: gh ${desc}\n${err.stderr || err.message}`);
  }
}

// --- Parse epics.md ----------------------------------------------------

function parseEpics(content) {
  const epics = [];
  const stories = [];

  let _currentEpic = null;
  let currentStory = null;
  let inAcceptanceCriteria = false;
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Epic header: "## Epic N: Title" or "### Epic N: Title" (list section)
    const epicMatch = line.match(/^#{2,3} Epic (\d+): (.+)$/);
    if (epicMatch) {
      if (currentStory) {
        stories.push(currentStory);
        currentStory = null;
      }
      const epicNum = parseInt(epicMatch[1], 10);
      let existing = epics.find((e) => e.number === epicNum);
      if (!existing) {
        existing = { number: epicNum, title: epicMatch[2].trim() };
        epics.push(existing);
      }
      _currentEpic = existing;
      inAcceptanceCriteria = false;
      continue;
    }

    // Story header: "### Story N.M: Title"
    const storyMatch = line.match(/^### Story (\d+)\.(\d+): (.+)$/);
    if (storyMatch) {
      if (currentStory) stories.push(currentStory);
      const epicNum = parseInt(storyMatch[1], 10);
      const storyNum = parseInt(storyMatch[2], 10);
      currentStory = {
        epicNumber: epicNum,
        storyNumber: storyNum,
        key: `${epicNum}-${storyNum}`,
        title: storyMatch[3].trim(),
        userStory: [],
        acceptanceCriteria: [],
        frs: [],
        nfrs: [],
      };
      inAcceptanceCriteria = false;
      continue;
    }

    if (!currentStory) continue;

    // User story lines (As a / I want / So that)
    if (
      line.match(/^(As an?|I want|So that)\b/i) ||
      line.match(/^\*\*(As an?|I want|So that)\*\*/i)
    ) {
      currentStory.userStory.push(line.trim());
      continue;
    }

    // Acceptance criteria section
    if (line.match(/^\*\*Acceptance Criteria/i) || line.match(/^#### Acceptance Criteria/i)) {
      inAcceptanceCriteria = true;
      continue;
    }

    // Next story or epic resets AC collection
    if (line.match(/^##/)) {
      inAcceptanceCriteria = false;
    }

    // Given/When/Then lines inside AC
    // "Given" starts a new acceptance criterion; When/Then/And append to it
    if (inAcceptanceCriteria && line.match(/^\*\*Given\*\*/)) {
      currentStory.acceptanceCriteria.push(line.trim());
      continue;
    }
    if (inAcceptanceCriteria && line.match(/^\*\*(?:When|Then|And)\*\*/)) {
      const last = currentStory.acceptanceCriteria.length - 1;
      if (last >= 0) {
        currentStory.acceptanceCriteria[last] += `\n${line.trim()}`;
      } else {
        currentStory.acceptanceCriteria.push(line.trim());
      }
      continue;
    }

    // FR/NFR references
    const frMatch =
      line.match(/\*\*FRs? covered:\*\*\s*(.+)/i) ||
      line.match(/\*\*Functional Requirements:\*\*\s*(.+)/i);
    if (frMatch) {
      currentStory.frs.push(frMatch[1].trim());
      continue;
    }
    const nfrMatch = line.match(/\*\*NFRs? addressed:\*\*\s*(.+)/i);
    if (nfrMatch) {
      currentStory.nfrs.push(nfrMatch[1].trim());
    }
  }

  if (currentStory) stories.push(currentStory);
  return { epics, stories };
}

// --- Read sprint-status.yaml to determine done stories -----------------

function parseDoneStories(sprintContent) {
  const done = new Set();
  for (const line of sprintContent.split('\n')) {
    const match = line.match(/^\s+(\d+-\d+)-[^:]+:\s*done\s*$/);
    if (match) done.add(match[1]);
  }
  return done;
}

// --- Fetch milestones --------------------------------------------------

function fetchMilestones() {
  const milestones = gh(['api', 'repos/{owner}/{repo}/milestones?state=all', '--paginate'], {
    json: true,
    readOnly: true,
  });
  if (!Array.isArray(milestones)) {
    throw new Error(
      `Expected array of milestones from API, got ${typeof milestones}. ` +
        'This may indicate a pagination or authentication issue.',
    );
  }
  return milestones;
}

function buildMilestoneMap() {
  if (DRY_RUN) return new Map();
  const milestones = fetchMilestones();
  const map = new Map();
  for (const m of milestones) {
    const match = m.title.match(/^Epic (\d+):/);
    if (match) map.set(parseInt(match[1], 10), m.title);
  }
  return map;
}

// --- Create Milestones -------------------------------------------------

function createMilestones(epics) {
  console.log('\n--- Milestones ---');

  let existingTitles = [];
  if (!DRY_RUN) {
    existingTitles = fetchMilestones().map((m) => m.title);
  }

  for (const epic of epics) {
    const title = `Epic ${epic.number}: ${epic.title}`;
    if (existingTitles.includes(title)) {
      console.log(`  [exists] ${title}`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`  [dry-run] Would create milestone: ${title}`);
    } else {
      gh(['api', 'repos/{owner}/{repo}/milestones', '-f', `title=${title}`, '-f', 'state=open']);
      console.log(`  [created] ${title}`);
    }
  }
}

// --- Classify Stories ---------------------------------------------------

function classifyStory(story) {
  const title = story.title.toLowerCase();

  // Documentation-only stories (check before qa since some overlap)
  if (/\b(documentation|onboarding)\b/.test(title)) {
    return 'documentation';
  }

  // CI/CD and release pipeline stories
  if (/\b(pipeline|release automation|publishing)\b/.test(title)) {
    return 'github_actions';
  }

  // Quality/validation gate stories (not feature-level validation)
  if (/\bvalidation\b/.test(title) && !/\b(standalone|editor|sync)\b/.test(title)) {
    return 'qa';
  }

  // Infrastructure scaffolding and tooling
  if (/\bscaffold\b/.test(title) && /\b(tooling|linting)\b/.test(title)) {
    return 'dependencies';
  }

  // Default: application behavior changes (new features / enhancements)
  return 'enhancement';
}

// --- Create Labels -----------------------------------------------------

function createLabels() {
  console.log('\n--- Labels ---');

  const labels = [
    // Type labels (assigned per-story by classifyStory)
    { name: 'enhancement', color: 'A2EEEF', desc: 'New feature or request' },
    { name: 'documentation', color: '0075CA', desc: 'Documentation only' },
    { name: 'github_actions', color: 'E4E669', desc: 'CI/CD and release pipelines' },
    { name: 'qa', color: 'D4C5F9', desc: 'Tests and quality tooling' },
    { name: 'dependencies', color: '0366D6', desc: 'Dependency and tooling updates' },
    // Status labels (progression: backlog → ready → in-progress → review → done)
    { name: 'status:backlog', color: 'CCCCCC', desc: 'Story in backlog' },
    { name: 'status:ready', color: '0052CC', desc: 'Story planned, ready for dev' },
    { name: 'status:in-progress', color: '0E8A16', desc: 'Story in progress' },
    { name: 'status:review', color: 'FBCA04', desc: 'Story in review' },
    { name: 'status:done', color: '5319E7', desc: 'Story completed' },
  ];

  for (const label of labels) {
    if (DRY_RUN) {
      console.log(`  [dry-run] Would create label: ${label.name}`);
    } else {
      try {
        gh([
          'label',
          'create',
          label.name,
          '--color',
          label.color,
          '--description',
          label.desc,
          '--force',
        ]);
        console.log(`  [ok] ${label.name}`);
      } catch (err) {
        console.warn(`  [warn] Failed to create label "${label.name}": ${err.message}`);
      }
    }
  }
}

// --- Create Issues -----------------------------------------------------

function getExistingIssueForStory(storyKey, issueMap) {
  // Check the issue map first
  if (issueMap[storyKey]?.number) {
    const num = issueMap[storyKey].number;
    const issue = gh(['issue', 'view', String(num), '--json', 'number,url,state'], {
      json: true,
      ignoreError: true,
    });
    if (issue?.number) return issue;
  }

  // Fall back to title search with validation
  const [epicNum, storyNum] = storyKey.split('-');
  if (!epicNum || !storyNum) {
    console.warn(`  [warn] Malformed story key "${storyKey}", skipping lookup`);
    return null;
  }
  const searchTitle = `Story ${epicNum}.${storyNum}:`;
  const issues = gh(
    [
      'issue',
      'list',
      '--search',
      searchTitle,
      '--state',
      'all',
      '--json',
      'number,url,state,title',
      '--limit',
      '5',
    ],
    { json: true, readOnly: true },
  );
  if (!Array.isArray(issues)) return null;
  return issues.find((i) => i.title.startsWith(searchTitle)) ?? null;
}

function buildIssueBody(story) {
  const parts = [];

  if (story.userStory.length > 0) {
    parts.push('## User Story');
    parts.push('');
    parts.push(story.userStory.join('\n'));
    parts.push('');
  }

  if (story.acceptanceCriteria.length > 0) {
    parts.push('## Acceptance Criteria');
    parts.push('');
    for (const ac of story.acceptanceCriteria) {
      parts.push(`- [ ] ${ac}`);
    }
    parts.push('');
  }

  if (story.frs.length > 0) {
    parts.push(`**FRs:** ${story.frs.join(', ')}`);
  }
  if (story.nfrs.length > 0) {
    parts.push(`**NFRs:** ${story.nfrs.join(', ')}`);
  }

  parts.push('');
  parts.push('---');
  parts.push('_Synced from BMAD epics.md_');

  return parts.join('\n');
}

function createIssues(stories, doneStories) {
  console.log('\n--- Issues ---');
  const issueMap = {};

  // Load existing map — distinguish "missing" from "corrupt"
  if (existsSync(MAP_PATH)) {
    const raw = readFileSync(MAP_PATH, 'utf-8');
    try {
      Object.assign(issueMap, JSON.parse(raw));
    } catch {
      console.error(`Error: Issue map at ${MAP_PATH} contains invalid JSON.`);
      console.error('  This may indicate corruption from a previous interrupted run.');
      console.error('  Please inspect the file manually before re-running.');
      process.exit(1);
    }
  }

  // Fetch milestones once for all stories
  const milestoneMap = buildMilestoneMap();

  try {
    for (const story of stories) {
      const title = `Story ${story.epicNumber}.${story.storyNumber}: ${story.title}`;
      const typeLabel = classifyStory(story);
      const storyLabels = [typeLabel, 'status:backlog'];

      const existing = DRY_RUN ? null : getExistingIssueForStory(story.key, issueMap);

      if (existing) {
        console.log(`  [exists] #${existing.number} - ${title}`);
        issueMap[story.key] = { number: existing.number, url: existing.url };
        continue;
      }

      if (DRY_RUN) {
        console.log(`  [dry-run] Would create issue: ${title} [${typeLabel}]`);
        issueMap[story.key] = { number: 0, url: 'dry-run' };
        continue;
      }

      // Build args array — no string interpolation, no quoting hazards
      const milestoneTitle = milestoneMap.get(story.epicNumber);
      if (!milestoneTitle) {
        console.warn(
          `  [warn] No milestone for Epic ${story.epicNumber}; issue created without one.`,
        );
      }

      const args = ['issue', 'create', '--title', title];
      for (const l of storyLabels) {
        args.push('-l', l);
      }
      if (milestoneTitle) {
        args.push('-m', milestoneTitle);
      }
      args.push('--body-file', '-');

      // Pipe body via stdin — no temp files
      const body = buildIssueBody(story);
      const issueUrl = gh(args, { input: body });

      const issueNumMatch = issueUrl.match(/\/issues\/(\d+)/);
      if (!issueNumMatch) {
        console.error(`  [error] Issue created but could not parse number from: "${issueUrl}"`);
        console.error(`    Story ${story.key} may not be tracked. Check GitHub manually.`);
        continue;
      }

      const result = { number: parseInt(issueNumMatch[1], 10), url: issueUrl };
      console.log(`  [created] #${result.number} - ${title}`);
      issueMap[story.key] = result;

      // Close already-done stories
      if (doneStories.has(story.key)) {
        try {
          gh(['issue', 'close', String(result.number)]);
          gh([
            'issue',
            'edit',
            String(result.number),
            '--remove-label',
            'status:backlog',
            '--add-label',
            'status:done',
          ]);
          console.log(`  [closed] #${result.number} (story ${story.key} is done)`);
        } catch (err) {
          console.warn(`  [warn] Failed to close/update #${result.number}: ${err.message}`);
          console.warn('         Issue may need manual status update on GitHub.');
        }
      }
    }
  } finally {
    // Persist partial progress even if the loop threw mid-way
    if (!DRY_RUN && Object.keys(issueMap).length > 0) {
      saveIssueMap(issueMap);
    }
  }

  return issueMap;
}

// --- Save mapping file -------------------------------------------------

function saveIssueMap(issueMap) {
  console.log('\n--- Saving issue map ---');
  const dir = join(ROOT, '_bmad-output/implementation-artifacts');
  mkdirSync(dir, { recursive: true });

  // Atomic write: write to .tmp then rename
  const content = `${JSON.stringify(issueMap, null, 2)}\n`;
  const tmpPath = `${MAP_PATH}.tmp`;
  writeFileSync(tmpPath, content);
  renameSync(tmpPath, MAP_PATH);
  console.log(`  Saved to ${MAP_PATH}`);
}

// --- Main --------------------------------------------------------------

function main() {
  console.log('=== BMAD -> GitHub Sync ===');
  if (DRY_RUN) console.log('(DRY RUN - no changes will be made)\n');

  // Verify gh CLI is installed and authenticated
  try {
    execFileSync('gh', ['auth', 'status'], { stdio: 'pipe' });
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error('Error: `gh` CLI is not installed. Install from https://cli.github.com/');
    } else {
      console.error('Error: gh CLI is not authenticated or not working.');
      console.error('  Run `gh auth login` to authenticate.');
      console.error(`  Details: ${err.stderr || err.message}`);
    }
    process.exit(1);
  }

  // Parse epics.md
  let epicsContent;
  try {
    epicsContent = readFileSync(EPICS_PATH, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`Error: epics.md not found at ${EPICS_PATH}`);
      console.error('  Run the BMAD planning workflow to generate epics.md first.');
    } else {
      console.error(`Error reading epics.md: ${err.message}`);
    }
    process.exit(1);
  }

  const { epics, stories } = parseEpics(epicsContent);
  if (epics.length === 0 && stories.length === 0) {
    console.error('Error: No epics or stories found in epics.md.');
    console.error('  Expected format: "## Epic N: Title" for epics');
    console.error('  Expected format: "### Story N.M: Title" for stories');
    console.error(`  File: ${EPICS_PATH}`);
    process.exit(1);
  }
  console.log(`Parsed ${epics.length} epics, ${stories.length} stories`);

  // Parse sprint-status.yaml for done stories (optional file)
  let doneStories = new Set();
  try {
    const sprintContent = readFileSync(SPRINT_STATUS_PATH, 'utf-8');
    doneStories = parseDoneStories(sprintContent);
  } catch {
    console.log('  (sprint-status.yaml not found, skipping done-story detection)');
  }
  if (doneStories.size > 0) {
    console.log(`Done stories: ${[...doneStories].join(', ')}`);
  }

  createMilestones(epics);
  createLabels();
  const issueMap = createIssues(stories, doneStories);

  if (DRY_RUN) {
    console.log('\n[dry-run] Would save issue map with entries:', Object.keys(issueMap).join(', '));
  }

  console.log('\n=== Done ===');
}

// Only run when executed directly (not when imported by tests)
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export { parseEpics, parseDoneStories, classifyStory, buildIssueBody, gh };
