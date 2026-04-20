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
  ["im703_desaru_coast", "im703_desaru"],
  ["im703_tours_metropole_loire_valley", "im703_tours"],
  ["im703_goseong_korea", "im703_goseong"],
  ["im703_subic_bay", "im703_subic"],
  ["im703_nice_france", "im703_nice"],
  ["im703_luxembourg_region_moselle", "im703_luxembourg"],
  ["im703_hradec_kralove", "im703_hradec"],
  ["im703_knokke_heist", "im703_knokke"],
  ["im703_erkner_berlin_brandenburg", "im703_erkner"],
  ["im703_italy_emilia_romagna", "im703_emilia_romagna"],
  ["im703_washington_tri_cities", "im703_washington"],
  ["im703_portugal_cascais", "im703_portugal"],
  ["im703_virginias_blue_ridge", "im703_virginia"],
  ["im703_nelson_mandela_bay", "im703_south_africa"],
  ["im703_traverse_city", "im703_michigan"],
  ["im703_taitung", "im703_taiwan"],
  ["im703_alagoas", "im703_maceio"],
  ["im703_santa_rosa", "im703_vineman"],
  ["im703_puerto_rico", "im703_san_juan"],
  ["im703_california", "im703_oceanside"],
  ["im703_cozumel", "im703_cancun"],
  ["im703_elsinore", "im703_kronborg"],
  ["im703_south_american_championship", "im703_buenos_aires"],
];

const raceInfo = JSON.parse(readFileSync(raceInfoPath, "utf-8"));

function collectReferencedTsvs(raceInfoObj) {
  const set = new Set();
  for (const event of raceInfoObj.events) {
    for (const ed of event.editions || []) {
      for (const cat of ed.categories || []) {
        if (cat.result_tsv) set.add(cat.result_tsv);
      }
    }
  }
  return set;
}

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

  // Remove from race-info.json (in-memory)
  raceInfo.events.splice(removeIdx, 1);

  // Build set of still-referenced directories AFTER removal
  const stillReferencedDirs = collectReferencedDirs(raceInfo);

  // Delete directories that are no longer referenced by any event
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
