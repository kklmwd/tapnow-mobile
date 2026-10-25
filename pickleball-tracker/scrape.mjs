#!/usr/bin/env node
// Usage: node scrape.mjs [--out dir] [--raw]
// Writes sessions.json and SESSIONS.md to the out dir (default ./out),
// plus raw API responses under raw/ with --raw.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { scrapePlaytomic } from './lib/playtomic.mjs';
import { scrapeReclub } from './lib/reclub.mjs';
import { renderMarkdown } from './lib/render.mjs';

const args = process.argv.slice(2);
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'out';
const saveRaw = args.includes('--raw');

const warnings = [];
const log = (m) => console.log(m);
const warn = (m) => { console.warn(`warn: ${m}`); warnings.push(m); };
const rawFiles = [];
const raw = (name, data) => { if (saveRaw) rawFiles.push([name, data]); };

await mkdir(outDir, { recursive: true });

let previous = new Set();
try {
  const prev = JSON.parse(await readFile(join(outDir, 'sessions.json'), 'utf8'));
  previous = new Set(prev.sessions.map((s) => s.id));
} catch { /* first run */ }

const sources = {};
const sessions = [];
for (const [name, scrape] of [['Playtomic', scrapePlaytomic], ['Reclub', scrapeReclub]]) {
  try {
    const before = warnings.length;
    const { rows } = await scrape({ log, warn, raw });
    sessions.push(...rows);
    sources[name] = `${rows.length} found${warnings.length > before ? ', with warnings' : ''}`;
  } catch (e) {
    warn(`${name} failed: ${e.message}`);
    sources[name] = 'failed';
  }
}

const unique = [...new Map(sessions.map((s) => [s.id, s])).values()]
  .sort((a, b) => a.start.localeCompare(b.start) || a.venue.localeCompare(b.venue))
  .map((s) => ({ ...s, isNew: previous.size > 0 && !previous.has(s.id) }));

const generatedAt = new Date().toISOString();
const result = { generatedAt, sources, warnings, sessions: unique };
await writeFile(join(outDir, 'sessions.json'), JSON.stringify(result, null, 2));
await writeFile(join(outDir, 'SESSIONS.md'), renderMarkdown(result));
if (saveRaw) {
  await mkdir(join(outDir, 'raw'), { recursive: true });
  for (const [name, data] of rawFiles) {
    await writeFile(join(outDir, 'raw', `${name.replace(/[^\w.-]/g, '_')}.json`), JSON.stringify(data, null, 2));
  }
}
console.log(`${unique.length} sessions (${unique.filter((s) => s.isNew).length} new) → ${outDir}`);
// Fail the run only when every source failed, so a partial result still publishes.
if (Object.values(sources).every((v) => v === 'failed')) process.exit(1);
