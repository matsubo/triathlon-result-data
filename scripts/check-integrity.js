/**
 * check-integrity.js
 *
 * Normalize every Edition (scripts/lib/edition-document.js) and report
 * data-quality problems that schema validation alone cannot catch:
 *
 *   - header_warnings: an edition.json Category maps a column the TSV lacks, or a
 *     Category's result TSV is missing
 *   - unknown_status_tokens: an Athlete's rank cell holds text that is no
 *     known Status token
 *   - missing_laps: finished athletes with missing per-segment lap times
 *   - missing_total: finished athletes with no total time
 *   - implausible_pace: Segments whose median lap implies a pace outside the
 *     sport's plausible band, or strays from the Event's other Editions at
 *     the same declared distance (scripts/lib/segment-pace.js): the declared
 *     distance is probably not the course raced that day. Segments whose
 *     pace is genuine are Exceptions in checks/exceptions/pace.json and are not
 *     counted.
 *
 * Three kinds of problem fail the check outright and are never Known
 * issues: an Edition failing schemas/result.schema.json, a layout finding of the
 * corpus (scripts/lib/corpus.js: a file under master/ that is no corpus
 * file at its place, an Event or Edition directory missing event.json,
 * image.webp or edition.json, an Event without Editions, a repeated
 * Category id), and a stale pace Exception (it matches no measured
 * Segment, or the Segment it names is no longer flagged).
 *
 * Known issues (source-inherent gaps such as historical PDFs without splits)
 * live in the Known-issue ledger checks/known-issues/integrity.json. The check fails on
 * any drift from it: a regression, an improvement, or a stale entry
 * (docs/adr/0002-known-issue-counts-only-shrink.md).
 *
 * Usage:
 *   bun run scripts/check-integrity.js              # check against the ledger
 *   bun run scripts/check-integrity.js --update     # rewrite the ledger
 *   bun run scripts/check-integrity.js --verbose    # list every finding
 *   bun scripts/report-segment-pace.js              # implausible_pace by severity
 */

import { join } from "node:path";
import { readCategories } from "./lib/category-reader.js";
import { editionDocument, SchemaInvalid } from "./lib/edition-document.js";
import { loadExceptions } from "./lib/exceptions.js";
import { openLedger } from "./lib/known-issue-ledger.js";
import { fsRepo } from "./lib/repo.js";
import {
  checkPace,
  describePace,
  staleExceptions,
} from "./lib/segment-pace.js";

const repoRoot = join(import.meta.dirname, "..");
const ledgerPath = join(repoRoot, "checks", "known-issues", "integrity.json");

const args = process.argv.slice(2);
const update = args.includes("--update");
const verbose = args.includes("--verbose");

const repo = fsRepo(repoRoot);
const corpus = readCategories(repo);

/**
 * @typedef {"header_warnings" | "unknown_status_tokens" | "missing_laps" | "missing_total" | "implausible_pace"} Rule
 * @type {Record<string, Record<Rule, number> & { athletes: number }>}
 */
const results = {};
const details = [];
/** @type {string[]} */
const failures = corpus.findings.map((f) => `${f.kind}: ${f.message}`);

/** Flagged Segment paces per Category key (event/date/category). */
/** @type {Map<string, string[]>} */
const paceFlags = new Map();
const paceExceptions = loadExceptions("segment_pace");
const paceChecks = checkPace(corpus.categories, paceExceptions);
for (const stale of staleExceptions(paceChecks, paceExceptions))
  failures.push(
    `stale pace Exception in checks/exceptions/pace.json: ${stale}`,
  );
for (const check of paceChecks) {
  if (check.severity === 0) continue;
  const list = paceFlags.get(check.category.key) ?? [];
  list.push(describePace(check));
  paceFlags.set(check.category.key, list);
}
/** @type {Record<string, string>} */
const paceExamples = {};

for (const { event, edition, categories } of corpus.editions) {
  let built;
  try {
    built = editionDocument(repo, event.id, edition.date);
  } catch (err) {
    if (!(err instanceof SchemaInvalid)) throw err;
    failures.push(
      `schemas/result.schema.json: ${event.id} ${edition.date}\n${err.message}`,
    );
    continue;
  }
  const { document, issues } = built;
  categories.forEach((category, ci) => {
    const { def, key } = category;
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
    const pace = paceFlags.get(category.key) ?? [];
    if (pace.length > 0) paceExamples[key] = pace[0];
    if (verbose) for (const p of pace) details.push(`${key}: ${p}`);

    results[key] = {
      header_warnings: own.filter((i) => i.kind !== "unknown-status-token")
        .length,
      unknown_status_tokens: own.filter(
        (i) => i.kind === "unknown-status-token",
      ).length,
      missing_laps: missingLaps,
      missing_total: missingTotal,
      implausible_pace: pace.length,
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
  "implausible_pace",
];
/** @param {Rule | "athletes"} field */
const total = (field) =>
  Object.values(results).reduce((sum, r) => sum + r[field], 0);

console.log(
  `Checked ${Object.keys(results).length} categories / ${total("athletes")} athletes: ` +
    `${total("header_warnings")} header warnings, ` +
    `${total("unknown_status_tokens")} unknown status tokens, ` +
    `${total("missing_laps")} missing laps (finished), ` +
    `${total("missing_total")} missing totals (finished), ` +
    `${total("implausible_pace")} implausible Segment paces.`,
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
  updateCommand: "bun run update:known-issues:integrity",
});
/** @type {import("./lib/known-issue-ledger.js").FindingsByRule} */
const findingsByRule = {};
for (const rule of RULES) {
  findingsByRule[rule] = {};
  for (const [key, r] of Object.entries(results)) {
    findingsByRule[rule][key] = {
      count: r[rule],
      ...(rule === "implausible_pace" &&
        paceExamples[key] && { example: paceExamples[key] }),
    };
  }
}
const drift = ledger.check(findingsByRule);

if (update) {
  console.log(`Ledger updated: ${ledgerPath}`);
  process.exit(0);
}

if (drift.length > 0) {
  console.error(
    "\nKnown-issue ledger drift (checks/known-issues/integrity.json):",
  );
  for (const d of drift) console.error(`  ${d}`);
  process.exit(1);
}

console.log("Findings match the Known-issue ledger.");
