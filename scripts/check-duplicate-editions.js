#!/usr/bin/env bun
/**
 * Detects duplicate race editions by comparing the athlete content of TSV files.
 *
 * Rationale: multiple bulk-import passes (e.g., CoachCox series scrapes) can register
 * the same physical race under different event_ids when the upstream branding differs
 * (e.g. "IRONMAN 70.3 Japan" vs "IRONMAN 70.3 Centrair Chita Peninsula Japan").
 * Schema validation alone cannot catch this — only content comparison can.
 *
 * Strategy: for each edition, build a fingerprint from a stable subset of each row
 * (name + total_time). Within a given race year, if >=80% of fingerprints from one
 * edition appear in another edition (from a *different* event), flag the pair.
 *
 * Exit code 1 when duplicates are detected.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const OVERLAP_THRESHOLD = 0.8;

const raceInfo = JSON.parse(
  readFileSync(resolve(repoRoot, "race-info.json"), "utf-8"),
);

const allowlist = new Set(
  JSON.parse(
    readFileSync(resolve(repoRoot, "duplicate-allowlist.json"), "utf-8"),
  ).pairs.map(({ a, b }) => pairKey(a, b)),
);

function pairKey(a, b) {
  return [a, b].sort().join("||");
}

function normalizeName(name) {
  return (name || "").trim().replace(/\s+/g, "").toLowerCase();
}

function extractFingerprints(tsvPath, nameHeaders, totalHeaders) {
  const full = resolve(repoRoot, tsvPath);
  let content;
  try {
    content = readFileSync(full, "utf-8");
  } catch {
    return null;
  }
  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return new Set();
  const headers = lines[0].split("\t");
  const nameIdx = headers.findIndex((h) => nameHeaders.includes(h));
  const totalIdx = headers.findIndex((h) => totalHeaders.includes(h));
  if (nameIdx < 0 || totalIdx < 0) return new Set();
  const set = new Set();
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split("\t");
    const name = normalizeName(cells[nameIdx]);
    const total = (cells[totalIdx] || "").trim();
    if (name && total) set.add(`${name}|${total}`);
  }
  return set;
}

function collectEditions() {
  const out = [];
  for (const event of raceInfo.events) {
    for (const edition of event.editions || []) {
      const year = (edition.date || "").slice(0, 4);
      if (!year) continue;
      for (const cat of edition.categories || []) {
        if (!cat.result_tsv) continue;
        const nameHeaders = [];
        const totalHeaders = [];
        for (const mc of cat.meta_columns || []) {
          if (mc.role === "name") nameHeaders.push(mc.header);
          if (mc.role === "total_time") totalHeaders.push(mc.header);
        }
        if (nameHeaders.length === 0 || totalHeaders.length === 0) continue;
        const fingerprints = extractFingerprints(
          cat.result_tsv,
          nameHeaders,
          totalHeaders,
        );
        if (!fingerprints || fingerprints.size < 20) continue;
        out.push({
          event_id: event.id,
          category_id: cat.id,
          tsv: cat.result_tsv,
          year,
          fingerprints,
        });
      }
    }
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
  "\nIf these are genuinely distinct races, add the pair to duplicate-allowlist.json.",
);
console.error(
  "Otherwise, consolidate under one event_id and remove the duplicate entries from race-info.json + master/.",
);
process.exit(1);
