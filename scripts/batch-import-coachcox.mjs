/**
 * Batch import all missing Ironman races from CoachCox JSON API.
 * Reads /tmp/import_plan.json (created by survey script) and:
 *   1. Fetches each race's results JSON
 *   2. Converts to TSV using the same format as fetch-coachcox-canada.mjs
 *   3. Saves master/<year>/<eventId>_<year>/default.tsv (skips empty results)
 *   4. Writes a summary of fetched/skipped/failed
 *
 * Usage: node scripts/batch-import-coachcox.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const planPath = process.argv[2] || "/tmp/import_plan.json";
const resultsPath = process.argv[3] || "/tmp/import_results.json";
const plan = JSON.parse(readFileSync(planPath, "utf-8"));

function sec2hms(s) {
  if (s === null || s === undefined || s === "" || s === "0") return "";
  const n = Number.parseInt(s, 10);
  if (Number.isNaN(n) || n <= 0) return "";
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const ss = n % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function convertName(n) {
  if (!n) return "";
  const parts = n.split(",");
  if (parts.length !== 2) return n.trim();
  return `${parts[1].trim()} ${parts[0].trim()}`;
}

function convertGender(g) {
  if (g === "Male") return "M";
  if (g === "Female") return "F";
  return "";
}

const STATUS_ALIASES = { DQ: "DSQ" };

function convertRank(row) {
  const fs = (row.fs || "").trim();
  if (fs && fs !== "Finished" && fs !== "FIN") {
    return STATUS_ALIASES[fs] || fs;
  }
  return row.or ?? "";
}

function buildTsv(rows) {
  const header = [
    "ContactId", "Overall_Rank", "Name", "Gender", "Division", "Div_Rank",
    "Total_Time", "Swim", "T1", "Bike", "T2", "Run", "Country", "Status",
  ];
  const lines = [header.join("\t")];
  for (const r of rows) {
    lines.push([
      r.aid || "",
      convertRank(r),
      convertName(r.n),
      convertGender(r.g),
      r.di || "",
      r.odr ?? "",
      sec2hms(r.ot),
      sec2hms(r.st),
      sec2hms(r.t1t),
      sec2hms(r.bt),
      sec2hms(r.t2t),
      sec2hms(r.rt),
      r.c || "",
      r.fs || "",
    ].join("\t"));
  }
  return `${lines.join("\n")}\n`;
}

async function fetchRace(rid) {
  const url = `https://www.coachcox.co.uk/wp-json/imstats/v1.90/race/results/${rid}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (triathlon-result-data importer)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Build job list
const jobs = [];
for (const ev of plan.newEvents) {
  for (const r of ev.races) {
    jobs.push({
      eventId: ev.eventId,
      sid: ev.sid,
      year: r.year,
      rid: r.rid,
      kind: "new",
    });
  }
}
for (const ev of plan.missingYears) {
  for (const r of ev.missing) {
    jobs.push({
      eventId: ev.eventId,
      sid: ev.sid,
      year: r.year,
      rid: r.rid,
      kind: "fill",
    });
  }
}

console.log(`Fetching ${jobs.length} races...`);

const CONCURRENCY = 6;
const results = { ok: [], empty: [], failed: [] };

async function processJob(job) {
  const tsvPath = join(repoRoot, "master", job.year, `${job.eventId}_${job.year}`, "default.tsv");
  if (existsSync(tsvPath)) {
    return { job, status: "exists" };
  }
  try {
    const rows = await fetchRace(job.rid);
    if (!Array.isArray(rows) || rows.length === 0) {
      return { job, status: "empty" };
    }
    const tsv = buildTsv(rows);
    mkdirSync(dirname(tsvPath), { recursive: true });
    writeFileSync(tsvPath, tsv);
    return { job, status: "ok", rows: rows.length };
  } catch (err) {
    return { job, status: "failed", error: err.message };
  }
}

// Process in batches of CONCURRENCY
for (let i = 0; i < jobs.length; i += CONCURRENCY) {
  const batch = jobs.slice(i, i + CONCURRENCY);
  const batchResults = await Promise.all(batch.map(processJob));
  for (const r of batchResults) {
    if (r.status === "ok") {
      results.ok.push({ ...r.job, rows: r.rows });
      console.log(`✅ [${r.job.rid}] ${r.job.eventId} ${r.job.year}: ${r.rows} rows`);
    } else if (r.status === "empty") {
      results.empty.push(r.job);
      console.log(`⚠️  [${r.job.rid}] ${r.job.eventId} ${r.job.year}: empty (future race?)`);
    } else if (r.status === "exists") {
      console.log(`⏭️  [${r.job.rid}] ${r.job.eventId} ${r.job.year}: TSV exists, skipping`);
    } else {
      results.failed.push({ ...r.job, error: r.error });
      console.log(`❌ [${r.job.rid}] ${r.job.eventId} ${r.job.year}: ${r.error}`);
    }
  }
}

writeFileSync(resultsPath, JSON.stringify(results, null, 2));
const totalRows = results.ok.reduce((a, b) => a + b.rows, 0);
console.log(`\nDone: ${results.ok.length} ok (${totalRows} rows), ${results.empty.length} empty, ${results.failed.length} failed`);
console.log(`Results saved to ${resultsPath}`);
