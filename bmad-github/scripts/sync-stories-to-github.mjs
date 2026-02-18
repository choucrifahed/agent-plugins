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
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = process.cwd();
const EPICS_PATH = join(ROOT, '_bmad-output/planning-artifacts/epics.md');
const SPRINT_STATUS_PATH = join(
  ROOT,
  '_bmad-output/implementation-artifacts/sprint-status.yaml',
);
const MAP_PATH = join(
  ROOT,
  '_bmad-output/implementation-artifacts/github-issue-map.json',
);

// --- Helpers -----------------------------------------------------------

function gh(args, { json = false, ignoreError = false } = {}) {
  const argList = splitArgs(args);
  const desc = argList.join(' ');

  const isReadOnly =
    argList[0] === 'api' ||
    argList[0] === 'issue' && argList[1] === 'list' ||
    argList[0] === 'label' && argList[1] === 'list';

  if (DRY_RUN && !isReadOnly) {
    console.log(`[dry-run] gh ${desc}`);
    return json ? [] : '';
  }
  try {
    const out = execFileSync('gh', argList, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return json ? (out ? JSON.parse(out) : []) : out;
  } catch (err) {
    if (ignoreError) return json ? [] : '';
    throw new Error(`gh command failed: gh ${desc}\n${err.stderr || err.message}`);
  }
}

/** Split a command string into an args array, respecting quotes. */
function splitArgs(str) {
  const args = [];
  let current = '';
  let inQuote = null;
  for (const ch of str) {
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === ' ') {
      if (current) args.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}

// --- Parse epics.md ----------------------------------------------------

function parseEpics(content) {
  const epics = [];
  const stories = [];

  let currentEpic = null;
  let currentStory = null;
  let inAcceptanceCriteria = false;
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Epic header: "## Epic N: Title" or "### Epic N: Title" (list section)
    const epicMatch = line.match(/^#{2,3} Epic (\d+): (.+)$/);
    if (epicMatch) {
      // Push any in-progress story before switching epic context
      if (currentStory) {
        stories.push(currentStory);
        currentStory = null;
      }
      const epicNum = parseInt(epicMatch[1], 10);
      if (!epics.find((e) => e.number === epicNum)) {
        currentEpic = { number: epicNum, title: epicMatch[2].trim() };
        epics.push(currentEpic);
      } else {
        currentEpic = epics.find((e) => e.number === epicNum);
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

    // User story lines (As a / I want / So that)
    if (
      line.match(/^(As an?|I want|So that)\b/i) ||
      line.match(/^\*\*(As an?|I want|So that)\*\*/i)
    ) {
      currentStory.userStory.push(line.trim());
      continue;
    }

    // Acceptance criteria section
    if (
      line.match(/^\*\*Acceptance Criteria/i) ||
      line.match(/^#### Acceptance Criteria/i)
    ) {
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
        currentStory.acceptanceCriteria[last] += '\n' + line.trim();
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
      continue;
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

// --- Create Milestones -------------------------------------------------

function getExistingMilestones() {
  try {
    const milestones = gh(
      'api repos/{owner}/{repo}/milestones?state=all --paginate',
      { json: true },
    );
    return milestones.map((m) => m.title);
  } catch {
    return [];
  }
}

function createMilestones(epics) {
  console.log('\n--- Milestones ---');
  const existing = DRY_RUN ? [] : getExistingMilestones();

  for (const epic of epics) {
    const title = `Epic ${epic.number}: ${epic.title}`;
    if (existing.includes(title)) {
      console.log(`  [exists] ${title}`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`  [dry-run] Would create milestone: ${title}`);
    } else {
      gh(`api repos/{owner}/{repo}/milestones -f title="${title}" -f state=open`);
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
      gh(
        `label create "${label.name}" --color "${label.color}" --description "${label.desc}" --force`,
        { ignoreError: true },
      );
      console.log(`  [ok] ${label.name}`);
    }
  }
}

// --- Create Issues -----------------------------------------------------

function getMilestoneTitle(epicNumber) {
  const milestones = gh('api repos/{owner}/{repo}/milestones?state=all --paginate', {
    json: true,
  });
  const prefix = `Epic ${epicNumber}:`;
  const milestone = milestones.find((m) => m.title.startsWith(prefix));
  return milestone ? milestone.title : null;
}

function getExistingIssueForStory(storyKey, issueMap) {
  // Check the issue map first
  if (issueMap[storyKey] && issueMap[storyKey].number) {
    const num = issueMap[storyKey].number;
    const issue = gh(
      `issue view ${num} --json number,url,state`,
      { json: true, ignoreError: true },
    );
    if (issue && issue.number) return issue;
  }

  // Fall back to title search
  const epicNum = storyKey.split('-')[0];
  const storyNum = storyKey.split('-')[1];
  const searchTitle = `Story ${epicNum}.${storyNum}:`;
  const issues = gh(
    `issue list --search "${searchTitle}" --state all --json number,url,state --limit 1`,
    { json: true },
  );
  return issues.length > 0 ? issues[0] : null;
}

function buildIssueBody(story) {
  const parts = [];

  if (story.userStory.length > 0) {
    parts.push('## User Story\n');
    parts.push(story.userStory.join('\n'));
    parts.push('');
  }

  if (story.acceptanceCriteria.length > 0) {
    parts.push('## Acceptance Criteria\n');
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

  // Load existing map if present
  try {
    const existing = JSON.parse(readFileSync(MAP_PATH, 'utf-8'));
    Object.assign(issueMap, existing);
  } catch {
    // No existing map
  }

  for (const story of stories) {
    const title = `Story ${story.epicNumber}.${story.storyNumber}: ${story.title}`;
    const typeLabel = classifyStory(story);
    const labels = [typeLabel, 'status:backlog'];

    // Check if issue already exists
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

    // Write issue body to temp file (avoids shell escaping issues)
    const body = buildIssueBody(story);
    const bodyFile = join(ROOT, '.tmp-issue-body.md');
    writeFileSync(bodyFile, body);

    // Get milestone title (gh issue create -m expects the name, not the number)
    const milestoneTitle = getMilestoneTitle(story.epicNumber);
    const milestoneFlag = milestoneTitle ? `-m "${milestoneTitle}"` : '';

    // Create issue — gh issue create outputs the URL to stdout
    const labelFlags = labels.map((l) => `-l "${l}"`).join(' ');
    const issueUrl = gh(
      `issue create --title "${title}" ${labelFlags} ${milestoneFlag} --body-file "${bodyFile}"`,
    );

    try { unlinkSync(bodyFile); } catch { /* ignore */ }

    const issueNumMatch = issueUrl.match(/\/issues\/(\d+)/);
    const result = issueNumMatch
      ? { number: parseInt(issueNumMatch[1], 10), url: issueUrl }
      : null;

    if (result && result.number) {
      console.log(`  [created] #${result.number} - ${title}`);
      issueMap[story.key] = { number: result.number, url: result.url };

      // Close already-done stories immediately
      if (doneStories.has(story.key)) {
        gh(`issue close ${result.number}`, { ignoreError: true });
        gh(
          `issue edit ${result.number} --remove-label "status:backlog" --add-label "status:done"`,
          { ignoreError: true },
        );
        console.log(`  [closed] #${result.number} (story ${story.key} is done)`);
      }
    }
  }

  return issueMap;
}

// --- Save mapping file -------------------------------------------------

function saveIssueMap(issueMap) {
  console.log('\n--- Saving issue map ---');
  mkdirSync(join(ROOT, '_bmad-output/implementation-artifacts'), {
    recursive: true,
  });
  writeFileSync(MAP_PATH, JSON.stringify(issueMap, null, 2) + '\n');
  console.log(`  Saved to ${MAP_PATH}`);
}

// --- Main --------------------------------------------------------------

function main() {
  console.log('=== BMAD -> GitHub Sync ===');
  if (DRY_RUN) console.log('(DRY RUN - no changes will be made)\n');

  // Verify gh CLI
  try {
    execFileSync('gh', ['auth', 'status'], { stdio: 'pipe' });
  } catch {
    console.error(
      'Error: gh CLI is not authenticated. Run `gh auth login` first.',
    );
    process.exit(1);
  }

  // Parse epics.md
  const epicsContent = readFileSync(EPICS_PATH, 'utf-8');
  const { epics, stories } = parseEpics(epicsContent);
  console.log(`Parsed ${epics.length} epics, ${stories.length} stories`);

  // Parse sprint-status.yaml for done stories
  const sprintContent = readFileSync(SPRINT_STATUS_PATH, 'utf-8');
  const doneStories = parseDoneStories(sprintContent);
  if (doneStories.size > 0) {
    console.log(`Done stories: ${[...doneStories].join(', ')}`);
  }

  createMilestones(epics);
  createLabels();
  const issueMap = createIssues(stories, doneStories);

  if (!DRY_RUN) {
    saveIssueMap(issueMap);
  } else {
    console.log(
      '\n[dry-run] Would save issue map with entries:',
      Object.keys(issueMap).join(', '),
    );
  }

  console.log('\n=== Done ===');
}

main();
