/**
 * check-integrity.js
 *
 * Normalize every Edition (scripts/lib/edition-document.js) and report
 * data-quality problems that schema validation alone cannot catch:
 *
 *   - header_warnings: race-info.json maps a column the TSV lacks, or a
 *     Category's result TSV is missing
 *   - unknown_status_tokens: an Athlete's rank cell holds text that is no
 *     known Status token
 *   - missing_laps: finished athletes with missing per-segment lap times
 *   - missing_total: finished athletes with no total time
 *
 * Two kinds of problem fail the check outright and are never Known issues:
 * an Edition failing result-schema.json, and a corpus finding of the
 * Category reader (a repeated Edition, a TSV shared by Categories, a TSV no
 * Category registers).
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

import { join } from "node:path";
import { readCategories } from "./lib/category-reader.js";
import { editionDocument, SchemaInvalid } from "./lib/edition-document.js";
import { openLedger } from "./lib/known-issue-ledger.js";
import { fsRepo } from "./lib/repo.js";

const repoRoot = join(import.meta.dirname, "..");
const ledgerPath = join(repoRoot, "integrity-baseline.json");

const args = process.argv.slice(2);
const update = args.includes("--update");
const verbose = args.includes("--verbose");

const repo = fsRepo(repoRoot);
const corpus = readCategories(repo);

/**
 * @typedef {"header_warnings" | "unknown_status_tokens" | "missing_laps" | "missing_total"} Rule
 * @type {Record<string, Record<Rule, number> & { athletes: number }>}
 */
const results = {};
const details = [];
/** @type {string[]} */
const failures = corpus.findings.map((f) => `${f.kind}: ${f.message}`);

for (const { event, edition, categories } of corpus.editions) {
  let built;
  try {
    built = editionDocument(repo, event.id, edition.date);
  } catch (err) {
    if (!(err instanceof SchemaInvalid)) throw err;
    failures.push(
      `result-schema.json: ${event.id} ${edition.date}\n${err.message}`,
    );
    continue;
  }
  const { document, issues } = built;
  categories.forEach((category, ci) => {
    const { def } = category;
    const key = `${event.id}/${edition.date.slice(0, 4)}/${def.id}`;
    const { athletes } = document.categories[ci];
    const own = issues.filter((i) => i.categoryId === def.id);
    const finished = athletes.filter((a) => a.status === "finished");
    // Only segments that actually map a lap column can be expected to
    // have lap data — many historical sources publish no splits at all.
    const lapSegmentIdxs = def.segments
      .map((/** @type {unknown} */ _, /** @type {number} */ i) =>
        category.columns("lap", { segment: i }).length > 0 ? i : -1,
      )
      .filter((/** @type {number} */ i) => i !== -1);

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

    for (const i of own) {
      details.push(`${key}: ${i.message}`);
    }
    if (verbose && missingTotal > 0) {
      details.push(
        `${key}: ${missingTotal} finished athletes with no total time`,
      );
    }

    results[key] = {
      header_warnings: own.filter((i) => i.kind !== "unknown-status-token")
        .length,
      unknown_status_tokens: own.filter(
        (i) => i.kind === "unknown-status-token",
      ).length,
      missing_laps: missingLaps,
      missing_total: missingTotal,
      athletes: athletes.length,
    };
  });
}

if (failures.length > 0) {
  console.error(
    `${failures.length} problem(s) that are never Known issues; fix them first:`,
  );
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

/** @type {Rule[]} */
const RULES = [
  "header_warnings",
  "unknown_status_tokens",
  "missing_laps",
  "missing_total",
];
/** @param {Rule | "athletes"} field */
const total = (field) =>
  Object.values(results).reduce((sum, r) => sum + r[field], 0);

console.log(
  `Checked ${Object.keys(results).length} categories / ${total("athletes")} athletes: ` +
    `${total("header_warnings")} header warnings, ` +
    `${total("unknown_status_tokens")} unknown status tokens, ` +
    `${total("missing_laps")} missing laps (finished), ` +
    `${total("missing_total")} missing totals (finished).`,
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
/** @type {import("./lib/known-issue-ledger.js").FindingsByRule} */
const findingsByRule = {};
for (const rule of RULES) {
  findingsByRule[rule] = {};
  for (const [key, r] of Object.entries(results)) {
    findingsByRule[rule][key] = { count: r[rule] };
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
