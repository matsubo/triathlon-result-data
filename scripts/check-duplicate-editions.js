#!/usr/bin/env bun
/**
 * Detects duplicate race editions by comparing the athlete content of TSV files.
 *
 * Rationale: multiple bulk-import passes (e.g., CoachCox series scrapes) can register
 * the same physical race under different event_ids when the upstream branding differs
 * (e.g. "IRONMAN 70.3 Japan" vs "IRONMAN 70.3 Centrair Chita Peninsula Japan").
 * Schema validation alone cannot catch this — only content comparison can.
 *
 * Strategy: for each Category, build a fingerprint from normalized values of each
 * Athlete row read by Column role: the name without whitespace, lower-cased, plus the
 * total time in seconds (so `1:02:03` and `01:02:03` match). Within a given race year,
 * if >=80% of fingerprints from one Category appear in another (from a *different*
 * event), flag the pair.
 *
 * Exit code 1 when duplicates are detected.
 */

import { resolve } from "node:path";
import { readCategories } from "./lib/category-reader.js";
import { loadExceptions } from "./lib/exceptions.js";
import { parseTime } from "./lib/normalize-time.js";
import { fsRepo } from "./lib/repo.js";

const repoRoot = resolve(import.meta.dirname, "..");

const OVERLAP_THRESHOLD = 0.8;

const allowlist = new Set(
  loadExceptions("duplicate_edition").map(({ a, b }) => pairKey(a, b)),
);

function pairKey(a, b) {
  return [a, b].sort().join("||");
}

function normalizeName(name) {
  return (name || "").trim().replace(/\s+/g, "").toLowerCase();
}

function collectEditions() {
  const out = [];
  for (const category of readCategories(fsRepo(repoRoot)).categories) {
    if (
      category.columns("name").length === 0 ||
      category.columns("total_time").length === 0
    )
      continue;
    const fingerprints = new Set();
    for (const row of category.rows) {
      const name = normalizeName(row.get("name"));
      const seconds = parseTime(row.get("total_time"));
      if (name && seconds !== null) fingerprints.add(`${name}|${seconds}`);
    }
    if (fingerprints.size < 20) continue;
    out.push({
      event_id: category.eventId,
      category_id: category.def.id,
      tsv: category.tsv,
      year: category.date.slice(0, 4),
      fingerprints,
    });
  }
  return out;
}

function computeOverlap(a, b) {
  const smaller = a.size < b.size ? a : b;
  const larger = smaller === a ? b : a;
  let hits = 0;
  for (const fp of smaller) if (larger.has(fp)) hits++;
  return hits / smaller.size;
}

const editions = collectEditions();
const byYear = new Map();
for (const ed of editions) {
  if (!byYear.has(ed.year)) byYear.set(ed.year, []);
  byYear.get(ed.year).push(ed);
}

const duplicates = [];
for (const [year, list] of byYear) {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a.event_id === b.event_id) continue;
      const overlap = computeOverlap(a.fingerprints, b.fingerprints);
      if (overlap >= OVERLAP_THRESHOLD) {
        duplicates.push({ year, a, b, overlap });
      }
    }
  }
}

const unexpected = duplicates.filter(
  (d) => !allowlist.has(pairKey(d.a.event_id, d.b.event_id)),
);

if (unexpected.length === 0) {
  console.log(
    `No unexpected duplicates detected across ${editions.length} editions.`,
  );
  process.exit(0);
}

console.error(`Found ${unexpected.length} unexpected duplicate pair(s):`);
for (const d of unexpected) {
  console.error(
    `  [${d.year}] ${d.a.event_id} vs ${d.b.event_id} — ${(d.overlap * 100).toFixed(1)}% row overlap`,
  );
  console.error(`    A: ${d.a.tsv}`);
  console.error(`    B: ${d.b.tsv}`);
}
console.error(
  '\nIf these are genuinely distinct races, add the pair as an Exception to the "entries" of duplicate-allowlist.json.',
);
console.error(
  "Otherwise, consolidate under one event_id and remove the duplicate entries from race-info.json + master/.",
);
process.exit(1);
