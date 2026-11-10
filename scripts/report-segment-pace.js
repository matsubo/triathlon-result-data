/**
 * report-segment-pace.js
 *
 * Run the Segment pace check (scripts/lib/segment-pace.js) over every
 * Category and print a Markdown report: totals, the median-pace distribution
 * per sport the bands are calibrated on, and the flagged Segments by
 * severity.
 *
 * Usage:
 *   bun scripts/report-segment-pace.js            # totals, bands, top 40
 *   bun scripts/report-segment-pace.js --top 100  # top 100
 *   bun scripts/report-segment-pace.js --all      # every flagged Segment
 */
import { join } from "node:path";
import { readCategories } from "./lib/category-reader.js";
import { loadExceptions } from "./lib/exceptions.js";
import { fsRepo } from "./lib/repo.js";
import {
  checkPace,
  clock,
  MAX_EDITION_RATIO,
  PACE_BANDS,
  PACE_UNITS,
  segmentLabel,
  segmentMedians,
} from "./lib/segment-pace.js";

const args = process.argv.slice(2);
const topAt = args.indexOf("--top");
const top = args.includes("--all")
  ? Number.POSITIVE_INFINITY
  : topAt >= 0
    ? Number(args[topAt + 1])
    : 40;

const { categories } = readCategories(fsRepo(join(import.meta.dirname, "..")));
const checks = checkPace(categories, loadExceptions("segment_pace"));
const flagged = checks
  .filter((c) => c.severity > 0)
  .sort((a, b) => b.severity - a.severity);

/** @type {Record<string, number>} */
const skipped = {};
let segments = 0;
for (const category of categories) {
  for (const s of segmentMedians(category)) {
    segments++;
    if (s.skipped === null) continue;
    const why = s.skipped.replace(
      /^\d+ finisher laps$/,
      "fewer than 5 finisher laps",
    );
    skipped[why] = (skipped[why] ?? 0) + 1;
  }
}

const out = [];
out.push("# Segment pace report", "");
out.push(
  `- Categories: ${categories.length}; Segments: ${segments}; measured: ${checks.length}`,
);
out.push(
  `- Skipped: ${segments - checks.length} (${Object.entries(skipped)
    .map(([why, n]) => `${why}: ${n}`)
    .join(", ")})`,
);
out.push(
  `- Flagged Segments: ${flagged.length} in ${new Set(flagged.map((c) => c.category.key)).size} Categories ` +
    `(outside the band: ${flagged.filter((c) => c.outsideBand).length}, ` +
    `off the other Editions by more than ×${MAX_EDITION_RATIO}: ${flagged.filter((c) => c.offEditions).length}, ` +
    `both: ${flagged.filter((c) => c.outsideBand && c.offEditions).length})`,
);
out.push(
  `- Exempted as genuine (checks/exceptions/pace.json): ${checks.filter((c) => c.exception).length}`,
);
out.push("", "## Bands", "");
out.push(
  "| sport | unit | band | typical | measured | p1 | p5 | p50 | p95 | p99 | outside (Categories) |",
  "|---|---|---|---|---|---|---|---|---|---|---|",
);
for (const [sport, band] of Object.entries(PACE_BANDS)) {
  const units = PACE_UNITS[sport];
  const paces = checks
    .filter((c) => c.segment.sport === sport)
    .map((c) => c.pace)
    .sort((a, b) => a - b);
  const fmt = (/** @type {number} */ p) =>
    sport === "bike" ? p.toFixed(1) : clock(p);
  const q = (/** @type {number} */ p) =>
    paces.length === 0 ? "–" : fmt(paces[Math.round(p * (paces.length - 1))]);
  const outside = new Set(
    checks
      .filter((c) => c.segment.sport === sport && c.outsideBand)
      .map((c) => c.category.key),
  ).size;
  out.push(
    `| ${sport} | ${units.unit} | ${band ? `${fmt(band.min)}–${fmt(band.max)}` : "none"} | ${band ? fmt(band.typical) : "–"} | ${paces.length} | ${q(0.01)} | ${q(0.05)} | ${q(0.5)} | ${q(0.95)} | ${q(0.99)} | ${outside} |`,
  );
}

out.push(
  "",
  `## Flagged Segments by severity (${Math.min(top, flagged.length)} of ${flagged.length})`,
  "",
);
out.push(
  "| # | Event | date | Category | Segment | declared km | median lap | implied pace | ×other Editions | implied km | flags | severity |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|",
);
flagged.slice(0, top).forEach((c, i) => {
  const units = PACE_UNITS[c.segment.sport];
  const flags = [c.outsideBand && "band", c.offEditions && "editions"]
    .filter(Boolean)
    .join("+");
  out.push(
    `| ${i + 1} | ${c.category.eventId} | ${c.category.date} | ${c.category.def.id} | ${segmentLabel(c.segment)} | ${c.segment.km} | ${clock(c.segment.median)} | ${units.format(c.pace)} | ${c.ratio === null ? "–" : `${c.ratio.toFixed(2)} (${c.peers})`} | ${c.impliedKm.toFixed(2)} | ${flags} | ${c.severity.toFixed(2)} |`,
  );
});
console.log(out.join("\n"));
