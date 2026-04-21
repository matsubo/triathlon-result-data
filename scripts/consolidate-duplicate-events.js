#!/usr/bin/env bun
/**
 * One-shot consolidation script for duplicate event_ids flagged by
 * scripts/check-duplicate-editions.js.
 *
 * For each (keep, remove) pair:
 *   1. Remove the `remove` event from race-info.json.
 *   2. Delete master/<year>/<remove>_<year>/ directories that are no longer
 *      referenced by any kept event (so self-duplicate paths stay intact).
 *
 * Run: bun scripts/consolidate-duplicate-events.js
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const raceInfoPath = resolve(repoRoot, "race-info.json");

const pairs = [
  // 2026-04 second-pass consolidations
  ["haskap", "tomakomai"],
  ["shichigahama", "sendai"],
  ["itako", "suigo_itako"],
  ["ironman_japan", "ironman_minami_hokkaido"],
  ["ironman_japan", "ironman_south_hokkaido"],
  ["ironman_argentina", "im703_mar_del_plata"],
];

const raceInfo = JSON.parse(readFileSync(raceInfoPath, "utf-8"));

function collectReferencedDirs(raceInfoObj) {
  const set = new Set();
  for (const event of raceInfoObj.events) {
    for (const ed of event.editions || []) {
      if (ed.weather_file) set.add(dirname(ed.weather_file));
      for (const cat of ed.categories || []) {
        if (cat.result_tsv) set.add(dirname(cat.result_tsv));
      }
    }
  }
  return set;
}

let consolidated = 0;
let skipped = 0;

for (const [keepId, removeId] of pairs) {
  const keepIdx = raceInfo.events.findIndex((e) => e.id === keepId);
  const removeIdx = raceInfo.events.findIndex((e) => e.id === removeId);

  if (removeIdx < 0) {
    console.log(`SKIP ${removeId}: already absent`);
    skipped++;
    continue;
  }
  if (keepIdx < 0) {
    console.log(`SKIP ${removeId}: keep event ${keepId} not found`);
    skipped++;
    continue;
  }

  const removeEvent = raceInfo.events[removeIdx];
  const removedDirs = new Set();
  for (const ed of removeEvent.editions || []) {
    if (ed.weather_file) removedDirs.add(dirname(ed.weather_file));
    for (const cat of ed.categories || []) {
      if (cat.result_tsv) removedDirs.add(dirname(cat.result_tsv));
    }
  }

  raceInfo.events.splice(removeIdx, 1);

  const stillReferencedDirs = collectReferencedDirs(raceInfo);

  for (const dir of removedDirs) {
    if (!stillReferencedDirs.has(dir)) {
      const full = resolve(repoRoot, dir);
      if (existsSync(full)) {
        rmSync(full, { recursive: true, force: true });
        console.log(`  DELETE ${dir}`);
      }
    }
  }
  console.log(`REMOVED event ${removeId} (kept ${keepId})`);
  consolidated++;
}

writeFileSync(raceInfoPath, `${JSON.stringify(raceInfo, null, 2)}\n`);
console.log(`\nDone. consolidated=${consolidated} skipped=${skipped}`);
