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
 * Saves mapping to <output_folder>/implementation-artifacts/github-issue-map.json
 *
 * Reads BMAD's output_folder from _bmad/bmm/config.yaml (falls back to '_bmad-output').
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = process.cwd();

// --- BMAD config resolution -----------------------------------------------

const DEFAULT_OUTPUT_FOLDER = '_bmad-output';

/**
 * Read BMAD's output_folder from the BMM module config.
 * Checks _bmad/bmm/config.yaml for an output_folder key.
 * Falls back to '_bmad-output' if not found.
 */
function resolveBmadOutputFolder(root) {
  const configPath = join(root, '_bmad/bmm/config.yaml');
  try {
    const content = readFileSync(configPath, 'utf-8');
    // Match "output_folder: <value>" — handles quoted and unquoted values,
    // and resolves {project-root} placeholder to the actual root.
    const match = content.match(/^output_folder:\s*['"]?(.+?)['"]?\s*$/m);
    if (match) {
      const raw = match[1].replace(/\{project-root\}/g, root);
      // If the resolved value is absolute, use it directly; otherwise join with root
      return raw.startsWith('/') ? raw : join(root, raw);
    }
  } catch {
    // Config file doesn't exist or isn't readable — use default
  }
  return join(root, DEFAULT_OUTPUT_FOLDER);
}

const OUTPUT_FOLDER = resolveBmadOutputFolder(ROOT);
const EPICS_PATH = join(OUTPUT_FOLDER, 'planning-artifacts/epics.md');
const SPRINT_STATUS_PATH = join(OUTPUT_FOLDER, 'implementation-artifacts/sprint-status.yaml');
const MAP_PATH = join(OUTPUT_FOLDER, 'implementation-artifacts/github-issue-map.json');

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
    if (!json) return out;
    if (!out) return null;
    try {
      return JSON.parse(out);
    } catch (parseErr) {
      throw new Error(
        `Failed to parse JSON from: gh ${desc}\n` +
          `Response (first 200 chars): ${out.slice(0, 200)}\n` +
          `Parse error: ${parseErr.message}`,
      );
    }
  } catch (err) {
    if (ignoreError) return json ? null : '';
    throw new Error(`gh command failed: gh ${desc}\n${err.stderr || err.message}`);
  }
}

// --- Parse epics.md ----------------------------------------------------

function parseEpics(content) {
  const epics = [];
  const stories = [];

  let currentStory = null;
  let inAcceptanceCriteria = false;
  for (const line of content.split('\n')) {
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

    // User story lines (As a / I want / So that) — plain or bold
    if (/^(?:\*\*)?(As an?|I want|So that)\b/i.test(line)) {
      currentStory.userStory.push(line.trim());
      continue;
    }

    // Acceptance criteria section
    if (/^(?:\*\*|#### )Acceptance Criteria/i.test(line)) {
      inAcceptanceCriteria = true;
      continue;
    }

    // Next story or epic resets AC collection
    if (/^##/.test(line)) {
      inAcceptanceCriteria = false;
    }

    // Given/When/Then lines inside AC
    // "Given" starts a new acceptance criterion; When/Then/And append to it
    if (inAcceptanceCriteria && /^\*\*Given\*\*/.test(line)) {
      currentStory.acceptanceCriteria.push(line.trim());
      continue;
    }
    if (inAcceptanceCriteria && /^\*\*(?:When|Then|And)\*\*/.test(line)) {
      const last = currentStory.acceptanceCriteria.length - 1;
      if (last >= 0) {
        currentStory.acceptanceCriteria[last] += `\n${line.trim()}`;
      } else {
        currentStory.acceptanceCriteria.push(line.trim());
      }
      continue;
    }

    // FR/NFR references
    const frMatch = line.match(/\*\*(?:FRs? covered|Functional Requirements):\*\*\s*(.+)/i);
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
    const match = line.match(/^\s+(\d+-\d+)(?:-[^:]+)?:\s*done\s*$/);
    if (match) done.add(match[1]);
  }
  return done;
}

// --- Fetch milestones --------------------------------------------------

function fetchMilestones() {
  const milestones = gh(
    ['api', 'repos/{owner}/{repo}/milestones?state=all', '--paginate', '--slurp'],
    { json: true, readOnly: true },
  );
  if (!Array.isArray(milestones)) {
    throw new Error(
      `Expected array of milestones from API, got ${typeof milestones}. ` +
        'This may indicate a pagination or authentication issue.',
    );
  }
  return milestones;
}

function buildMilestoneMap(milestones) {
  const map = new Map();
  for (const m of milestones) {
    const match = m.title.match(/^Epic (\d+):/);
    if (match) map.set(parseInt(match[1], 10), m.title);
  }
  return map;
}

// --- Create Milestones -------------------------------------------------

/**
 * Create milestones for each epic and return the fetched milestones
 * so callers can reuse them without a redundant API call.
 */
function createMilestones(epics) {
  console.log('\n--- Milestones ---');

  const milestones = DRY_RUN ? [] : fetchMilestones();
  const existingTitles = new Set(milestones.map((m) => m.title));

  for (const epic of epics) {
    const title = `Epic ${epic.number}: ${epic.title}`;
    if (existingTitles.has(title)) {
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

  return milestones;
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

  let failures = 0;
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
        failures++;
        console.error(`  [error] Failed to create label "${label.name}": ${err.message}`);
        if (failures >= 2) {
          throw new Error(
            `Multiple label creation failures (${failures}). ` +
              'This likely indicates an authentication, permissions, or network issue.',
          );
        }
      }
    }
  }
}

// --- Create Issues -----------------------------------------------------

function getExistingIssueForStory(storyKey, issueMap) {
  // Check the issue map first
  if (issueMap[storyKey]?.number) {
    const num = issueMap[storyKey].number;
    try {
      const issue = gh(['issue', 'view', String(num), '--json', 'number,url,state'], {
        json: true,
        readOnly: true,
      });
      if (issue?.number) return issue;
    } catch (err) {
      // Only fall through if the issue was genuinely not found (deleted/transferred)
      if (/not found|could not resolve/i.test(err.message)) {
        console.warn(`  [warn] Issue #${num} from map no longer exists, will re-search.`);
      } else {
        throw err;
      }
    }
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
      '100',
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

function loadIssueMap() {
  if (!existsSync(MAP_PATH)) return {};
  const raw = readFileSync(MAP_PATH, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch {
    console.error(`Error: Issue map at ${MAP_PATH} contains invalid JSON.`);
    console.error('  This may indicate corruption from a previous interrupted run.');
    console.error('  Please inspect the file manually before re-running.');
    process.exit(1);
  }
}

function createIssues(stories, doneStories, milestoneMap) {
  console.log('\n--- Issues ---');
  const issueMap = loadIssueMap();

  try {
    for (const story of stories) {
      const title = `Story ${story.epicNumber}.${story.storyNumber}: ${story.title}`;
      const typeLabel = classifyStory(story);
      const isDone = doneStories.has(story.key);
      const storyLabels = [typeLabel, isDone ? 'status:done' : 'status:backlog'];

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

      const labelArgs = storyLabels.flatMap((l) => ['-l', l]);
      const milestoneArgs = milestoneTitle ? ['-m', milestoneTitle] : [];
      const args = [
        'issue',
        'create',
        '--title',
        title,
        ...labelArgs,
        ...milestoneArgs,
        '--body-file',
        '-',
      ];

      // Pipe body via stdin — no temp files
      const body = buildIssueBody(story);
      const issueUrl = gh(args, { input: body });

      const issueNumMatch = issueUrl.match(/\/issues\/(\d+)/);
      if (!issueNumMatch) {
        // Store partial entry so the user can reconcile
        issueMap[story.key] = { number: null, url: issueUrl, error: 'unparseable-url' };
        throw new Error(
          `Issue created for story ${story.key} but could not parse number from: "${issueUrl}". ` +
            'Manual intervention required to prevent duplicates on next run.',
        );
      }

      const result = { number: parseInt(issueNumMatch[1], 10), url: issueUrl };
      console.log(`  [created] #${result.number} - ${title}`);
      issueMap[story.key] = result;

      // Close already-done stories
      if (isDone) {
        try {
          gh(['issue', 'close', String(result.number)]);
        } catch (err) {
          console.warn(`  [warn] Failed to close #${result.number}: ${err.message}`);
          console.warn('         Issue may need manual status update on GitHub.');
        }
        console.log(`  [closed] #${result.number} (story ${story.key} is done)`);
      }
    }
  } finally {
    // Persist partial progress even if the loop threw mid-way
    if (!DRY_RUN && Object.keys(issueMap).length > 0) {
      try {
        saveIssueMap(issueMap);
      } catch (saveErr) {
        console.error(`CRITICAL: Failed to save issue map: ${saveErr.message}`);
        console.error('  Issues were created on GitHub but the local map was NOT saved.');
        console.error('  Map contents (copy this manually):');
        console.error(JSON.stringify(issueMap, null, 2));
      }
    }
  }

  return issueMap;
}

// --- Save mapping file -------------------------------------------------

function saveIssueMap(issueMap) {
  console.log('\n--- Saving issue map ---');
  const dir = join(OUTPUT_FOLDER, 'implementation-artifacts');
  mkdirSync(dir, { recursive: true });

  // Atomic write: write to .tmp then rename
  const content = `${JSON.stringify(issueMap, null, 2)}\n`;
  const tmpPath = `${MAP_PATH}.tmp`;
  writeFileSync(tmpPath, content);
  try {
    renameSync(tmpPath, MAP_PATH);
  } catch (renameErr) {
    throw new Error(
      `Failed to atomically rename ${tmpPath} -> ${MAP_PATH}: ${renameErr.message}\n` +
        `  The map was written to ${tmpPath}. Rename it manually.`,
    );
  }
  console.log(`  Saved to ${MAP_PATH}`);
}

// --- Main --------------------------------------------------------------

function verifyGhCli() {
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
}

function readEpicsFile() {
  try {
    return readFileSync(EPICS_PATH, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`Error: epics.md not found at ${EPICS_PATH}`);
      console.error('  Run the BMAD planning workflow to generate epics.md first.');
    } else {
      console.error(`Error reading epics.md: ${err.message}`);
    }
    process.exit(1);
  }
}

function main() {
  console.log('=== BMAD -> GitHub Sync ===');
  if (DRY_RUN) console.log('(DRY RUN - no changes will be made)\n');

  verifyGhCli();

  const { epics, stories } = parseEpics(readEpicsFile());
  if (epics.length === 0) {
    console.error('Error: No epics found in epics.md.');
    console.error('  Expected format: "## Epic N: Title"');
    console.error(`  File: ${EPICS_PATH}`);
    process.exit(1);
  }
  if (stories.length === 0) {
    console.error('Error: No stories found in epics.md.');
    console.error('  Expected format: "### Story N.M: Title"');
    console.error(`  File: ${EPICS_PATH}`);
    process.exit(1);
  }
  console.log(`Parsed ${epics.length} epics, ${stories.length} stories`);

  // Parse sprint-status.yaml for done stories (optional file)
  let doneStories = new Set();
  try {
    const sprintContent = readFileSync(SPRINT_STATUS_PATH, 'utf-8');
    doneStories = parseDoneStories(sprintContent);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('  (sprint-status.yaml not found, skipping done-story detection)');
    } else {
      console.error(`Error reading sprint-status.yaml: ${err.message}`);
      console.error('  Done-story detection will be skipped. Stories may not be auto-closed.');
      console.error(`  File: ${SPRINT_STATUS_PATH}`);
    }
  }
  if (doneStories.size > 0) {
    console.log(`Done stories: ${[...doneStories].join(', ')}`);
  }

  const milestones = createMilestones(epics);
  createLabels();
  const milestoneMap = buildMilestoneMap(milestones);
  const issueMap = createIssues(stories, doneStories, milestoneMap);

  if (DRY_RUN) {
    console.log('\n[dry-run] Would save issue map with entries:', Object.keys(issueMap).join(', '));
  }

  console.log('\n=== Done ===');
}

// Only run when executed directly (not when imported by tests)
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`\nFatal error: ${err.message}`);
    if (process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

export { parseEpics, parseDoneStories, classifyStory, buildIssueBody, gh, resolveBmadOutputFolder };
