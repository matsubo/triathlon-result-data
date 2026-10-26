/**
 * check-integrity.js
 *
 * Normalize every edition/category in race-info.json and report data-quality
 * problems that schema validation alone cannot catch:
 *
 *   - header-mismatch warnings (race-info.json maps a column the TSV lacks)
 *   - finished athletes with missing per-segment lap times
 *   - finished athletes with no total time
 *   - athletes failing result-schema.json validation
 *
 * Known issues (source-inherent gaps such as historical PDFs without splits)
 * live in the Known-issue ledger integrity-baseline.json. The check fails on
 * any drift from it: a regression, an improvement, or a stale entry
 * (docs/adr/0002-known-issue-counts-only-shrink.md).
 *
 * Usage:
 *   bun run scripts/check-integrity.js              # check against the ledger
 *   bun run scripts/check-integrity.js --update     # rewrite the ledger
 *   bun run scripts/check-integrity.js --verbose    # list every finding
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCategory } from "./lib/normalize-category.js";
import { openLedger } from "./lib/known-issue-ledger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const ledgerPath = join(repoRoot, "integrity-baseline.json");

const args = process.argv.slice(2);
const update = args.includes("--update");
const verbose = args.includes("--verbose");

const raceInfo = JSON.parse(
  readFileSync(join(repoRoot, "race-info.json"), "utf-8"),
);

/** @type {Record<string, {warnings: number, missingLaps: number, missingTotal: number, athletes: number}>} */
const results = {};
const details = [];

for (const event of raceInfo.events) {
  for (const edition of event.editions) {
    for (const category of edition.categories) {
      const key = `${event.id}/${edition.date.slice(0, 4)}/${category.id}`;
      let tsvContent;
      try {
        tsvContent = readFileSync(join(repoRoot, category.result_tsv), "utf-8");
      } catch {
        details.push(`${key}: MISSING TSV ${category.result_tsv}`);
        results[key] = {
          warnings: 1,
          missingLaps: 0,
          missingTotal: 0,
          athletes: 0,
        };
        continue;
      }

      const { athletes, warnings } = normalizeCategory(tsvContent, category);
      const finished = athletes.filter((a) => a.status === "finished");
      // Only segments that actually map a lap column can be expected to
      // have lap data — many historical sources publish no splits at all.
      const lapSegmentIdxs = category.segments
        .map((seg, i) => (seg.columns.some((c) => c.role === "lap") ? i : -1))
        .filter((i) => i !== -1);

      let missingLaps = 0;
      for (const a of finished) {
        for (const i of lapSegmentIdxs) {
          if (!a.segments[i] || a.segments[i].lap_seconds == null) {
            missingLaps++;
            if (verbose) {
              details.push(
                `${key}: bib=${a.bib} ${a.name} missing segment[${i}] lap`,
              );
            }
          }
        }
      }
      const missingTotal = finished.filter(
        (a) => a.total_time_seconds == null,
      ).length;

      for (const w of warnings) {
        details.push(`${key}: ${w}`);
      }
      if (verbose && missingTotal > 0) {
        details.push(
          `${key}: ${missingTotal} finished athletes with no total time`,
        );
      }

      results[key] = {
        warnings: warnings.length,
        missingLaps,
        missingTotal,
        athletes: athletes.length,
      };
    }
  }
}

const totals = Object.values(results).reduce(
  (acc, r) => ({
    warnings: acc.warnings + r.warnings,
    missingLaps: acc.missingLaps + r.missingLaps,
    missingTotal: acc.missingTotal + r.missingTotal,
    athletes: acc.athletes + r.athletes,
    categories: acc.categories + 1,
  }),
  { warnings: 0, missingLaps: 0, missingTotal: 0, athletes: 0, categories: 0 },
);

console.log(
  `Checked ${totals.categories} categories / ${totals.athletes} athletes: ` +
    `${totals.warnings} header warnings, ` +
    `${totals.missingLaps} missing laps (finished), ` +
    `${totals.missingTotal} missing totals (finished).`,
);

if (details.length > 0) {
  const shown = verbose ? details : details.slice(0, 40);
  for (const d of shown) console.log(`  ${d}`);
  if (!verbose && details.length > shown.length) {
    console.log(
      `  ... and ${details.length - shown.length} more (use --verbose)`,
    );
  }
}

const ledger = openLedger(ledgerPath, {
  update,
  updateCommand: "bun run update:integrity-baseline",
});
/** @type {Record<string, "warnings" | "missingLaps" | "missingTotal">} */
const metricByRule = {
  header_warnings: "warnings",
  missing_laps: "missingLaps",
  missing_total: "missingTotal",
};
/** @type {import("./lib/known-issue-ledger.js").FindingsByRule} */
const findingsByRule = {};
for (const [rule, metric] of Object.entries(metricByRule)) {
  findingsByRule[rule] = {};
  for (const [key, r] of Object.entries(results)) {
    findingsByRule[rule][key] = { count: r[metric] };
  }
}
const drift = ledger.check(findingsByRule);

if (update) {
  console.log(`Ledger updated: ${ledgerPath}`);
  process.exit(0);
}

if (drift.length > 0) {
  console.error("\nKnown-issue ledger drift (integrity-baseline.json):");
  for (const d of drift) console.error(`  ${d}`);
  process.exit(1);
}

console.log("Findings match the Known-issue ledger.");
