// scripts/update-oss-contributions.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const README_PATH = path.join(__dirname, '..', 'README.md');
const START_TAG = '<!-- OSS-CONTRIB-START -->';
const END_TAG = '<!-- OSS-CONTRIB-END -->';

const STATUS_PRIORITY = { merged: 4, open: 3, draft: 2, closed: 1 };

/**
 * Types (TS-style, just for reference)
 * interface OSSContribution {
 *   _id: string;
 *   repository: string;
 *   title: string;
 *   url: string;
 *   status: 'merged' | 'open' | 'closed' | 'draft';
 *   isDraft: boolean;
 *   mergedAt: string | null;
 *   createdAt: string;
 *   body: string;
 *   labels: string[];
 *   isDisplayed: boolean;
 *   githubId: number;
 *   author: string;
 * }
 */

async function fetchContributions() {
  const res = await fetch(
    'https://zeeshanali-g.netlify.app/api/oss-contributions/displayed',
    {
      headers: { Accept: 'application/json' },
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch contributions: ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Expected JSON, got something else');
  }

  return res.json();
}

function groupAndSort(contributions) {
  // Group by repo
  const byRepo = contributions.reduce((acc, c) => {
    if (!acc[c.repository]) acc[c.repository] = [];
    acc[c.repository].push(c);
    return acc;
  }, {});

  // Sort contributions within each repo
  for (const repo of Object.keys(byRepo)) {
    byRepo[repo].sort((a, b) => {
      const aPriority = STATUS_PRIORITY[a.status] || 0;
      const bPriority = STATUS_PRIORITY[b.status] || 0;

      if (aPriority !== bPriority) {
        return bPriority - aPriority; // higher priority first
      }

      const aDate = new Date(a.mergedAt || a.createdAt);
      const bDate = new Date(b.mergedAt || b.createdAt);
      return bDate.getTime() - aDate.getTime(); // newest first
    });
  }

  // Sort repos by merged count, then total count
  const sortedRepos = Object.keys(byRepo).sort((a, b) => {
    const aContribs = byRepo[a];
    const bContribs = byRepo[b];

    const aMerged = aContribs.filter(c => c.status === 'merged').length;
    const bMerged = bContribs.filter(c => c.status === 'merged').length;

    if (aMerged !== bMerged) return bMerged - aMerged;
    return bContribs.length - aContribs.length;
  });

  return { byRepo, sortedRepos };
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function statusEmoji(status) {
  switch (status) {
    case 'merged':
      return '✅';
    case 'open':
      return '🟢';
    case 'draft':
      return '📝';
    case 'closed':
      return '🔴';
    default:
      return '❔';
  }
}

function buildMarkdown(byRepo, sortedRepos) {
  if (!sortedRepos.length) {
    return '\n_No public OSS contributions to display yet._\n';
  }

  let md = '\n';

  for (const repo of sortedRepos) {
    const contribs = byRepo[repo];

    md += `### 🔹 ${repo}\n\n`;

    // Limit number per repo so README doesn't explode; tweak as you like
    const maxPerRepo = 5;

    for (const c of contribs.slice(0, maxPerRepo)) {
      const emoji = statusEmoji(c.status);
      const dateStr = formatDate(c.mergedAt || c.createdAt);
      const labels = (c.labels || []).slice(0, 3); // show up to 3 labels
      const labelsStr = labels.length ? ` _(labels: ${labels.join(', ')})_` : '';

      md += `* ${emoji} [${c.title}](${c.url}) — **${c.status.toUpperCase()}**`;
      if (dateStr) md += ` (${dateStr})`;
      md += `${labelsStr}\n`;
    }

    md += '\n';
  }

  md += '> _Auto-generated from [`/api/oss-contributions/displayed`](https://zeeshanali-g.netlify.app/api/oss-contributions/displayed)_\n';

  return md;
}

function updateReadme(newSection) {
  const readme = fs.readFileSync(README_PATH, 'utf8');

  const startIndex = readme.indexOf(START_TAG);
  const endIndex = readme.indexOf(END_TAG);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error('Could not find OSS contribution markers in README.md');
  }

  const before = readme.slice(0, startIndex + START_TAG.length);
  const after = readme.slice(endIndex);

  const updated = `${before}\n${newSection}\n${after}`;

  fs.writeFileSync(README_PATH, updated);
}

async function main() {
  try {
    const contributions = await fetchContributions();
    const { byRepo, sortedRepos } = groupAndSort(contributions);
    const markdown = buildMarkdown(byRepo, sortedRepos);
    updateReadme(markdown);
    console.log('README.md updated with OSS contributions ✅');
  } catch (err) {
    console.error('Failed to update OSS contributions:', err);
    process.exit(1);
  }
}

main();
