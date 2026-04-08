/**
 * Fetch IRONMAN results from the competitor.com API and generate TSV files
 * with contactid (athlete UUID) included.
 *
 * Usage: bun run scripts/fetch-ironman-results.js [--dry-run] [--race <race_id>]
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

const API_BASE = "https://labs-v2.competitor.com/api/results";

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const raceIdx = args.indexOf("--race");
const raceFilter = raceIdx !== -1 ? args[raceIdx + 1] : null;
const inputIdx = args.indexOf("--input");
const inputFile =
  inputIdx !== -1 ? args[inputIdx + 1] : "ironman-subevent-ids.json";

// Load subevent IDs
const subeventsPath = join(__dirname, inputFile);
const subevents = JSON.parse(readFileSync(subeventsPath, "utf-8"));

// Load race-info to find TSV paths and year mappings
const raceInfo = JSON.parse(
  readFileSync(join(repoRoot, "race-info.json"), "utf-8"),
);

function findRaceConfig(raceId) {
  for (const ev of raceInfo.events) {
    if (ev.id === raceId) {
      return ev;
    }
  }
  return null;
}

function findEditionTsvPath(event, year) {
  for (const ed of event.editions) {
    if (ed.date.startsWith(String(year))) {
      if (ed.categories.length > 0) {
        return ed.categories[0].result_tsv;
      }
    }
  }
  return null;
}

function formatTime(seconds) {
  if (seconds == null || seconds === 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatGender(genderCode) {
  if (genderCode === 1) return "M";
  if (genderCode === 2) return "F";
  return "";
}

async function fetchResults(subeventUuid) {
  const url = `${API_BASE}?wtc_eventid=${subeventUuid}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  const json = await res.json();
  return json.resultsJson?.value || [];
}

function resultToTsvRow(r) {
  const contactId = r.wtc_ContactId?.contactid || "";
  const overallRank = r.wtc_finishrankoverall || "";
  const name = r.wtc_ContactId?.fullname || r.athlete || "";
  const gender = formatGender(r.wtc_ContactId?.gendercode);
  const division = r.wtc_AgeGroupId?.wtc_agegroupname || "";
  const divRank = r.wtc_finishrankgroup || "";
  const totalTime = formatTime(r.wtc_finishtime);
  const swim = formatTime(r.wtc_swimtime);
  const t1 = formatTime(r.wtc_transition1time);
  const bike = formatTime(r.wtc_biketime);
  const t2 = formatTime(r.wtc_transition2time);
  const run = formatTime(r.wtc_runtime);
  const country = r.wtc_ContactId?.address1_country || "";

  // Determine status
  let status = "";
  if (r.wtc_dnf) status = "DNF";
  else if (r.wtc_dns) status = "DNS";
  else if (r.wtc_dq) status = "DQ";

  return [
    contactId,
    overallRank,
    name,
    gender,
    division,
    divRank,
    totalTime,
    swim,
    t1,
    bike,
    t2,
    run,
    country,
    status,
  ].join("\t");
}

const TSV_HEADER = [
  "ContactId",
  "Overall_Rank",
  "Name",
  "Gender",
  "Division",
  "Div_Rank",
  "Total_Time",
  "Swim",
  "T1",
  "Bike",
  "T2",
  "Run",
  "Country",
  "Status",
].join("\t");

async function processRace(raceId, info) {
  console.log(`\n📥 ${raceId} (${info.name})...`);

  const results = await fetchResults(info.subevent_uuid);
  if (results.length === 0) {
    console.log(`  ⚠️  No results found`);
    return { raceId, count: 0, skipped: true };
  }

  // Sort by overall rank (finishers first, then DNF/DNS/DQ)
  const sorted = [...results].sort((a, b) => {
    const aRank = a.wtc_finishrankoverall || 99999;
    const bRank = b.wtc_finishrankoverall || 99999;
    return aRank - bRank;
  });

  const tsvLines = [TSV_HEADER, ...sorted.map(resultToTsvRow)];
  const tsvContent = `${tsvLines.join("\n")}\n`;

  // Determine output path
  const event = findRaceConfig(raceId);
  const tsvPath = event
    ? findEditionTsvPath(event, info.year)
    : `master/${info.year}/${raceId}/default.tsv`;

  if (!tsvPath) {
    console.log(`  ⚠️  No TSV path found in race-info.json`);
    return { raceId, count: results.length, skipped: true };
  }

  const fullPath = join(repoRoot, tsvPath);

  if (dryRun) {
    console.log(
      `  [DRY RUN] Would write ${results.length} results to ${tsvPath}`,
    );
  } else {
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, tsvContent);
    console.log(`  ✅ ${results.length} results → ${tsvPath}`);
  }

  return { raceId, count: results.length, skipped: false };
}

// Main
async function main() {
  const entries = Object.entries(subevents).filter(
    ([key]) => key !== "not_found",
  );

  const toProcess = raceFilter
    ? entries.filter(([key]) => key === raceFilter)
    : entries;

  if (toProcess.length === 0) {
    console.error("No matching races found.");
    process.exit(1);
  }

  console.log(
    `🏊 Fetching IRONMAN results for ${toProcess.length} races${dryRun ? " (DRY RUN)" : ""}...`,
  );

  const results = [];
  for (const [raceId, info] of toProcess) {
    try {
      const r = await processRace(raceId, info);
      results.push(r);
      // Delay to be polite to the API
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (err) {
      console.error(`  ❌ ${raceId}: ${err.message}`);
      results.push({ raceId, count: 0, skipped: true, error: err.message });
    }
  }

  console.log("\n📊 Summary:");
  const successful = results.filter((r) => !r.skipped);
  const failed = results.filter((r) => r.skipped);
  console.log(
    `  ✅ ${successful.length} races fetched (${successful.reduce((sum, r) => sum + r.count, 0)} total athletes)`,
  );
  if (failed.length > 0) {
    console.log(`  ⚠️  ${failed.length} races skipped/failed:`);
    for (const r of failed) {
      console.log(`    - ${r.raceId}${r.error ? `: ${r.error}` : ""}`);
    }
  }
}

main();
