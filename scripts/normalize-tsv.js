/**
 * normalize-tsv.js
 *
 * Normalize a single TSV file using the category definition from race-info.json.
 *
 * Usage:
 *   bun scripts/normalize-tsv.js <path-to-tsv>
 *
 * Example:
 *   bun scripts/normalize-tsv.js master/2025/ironman_cairns_2025/default.tsv
 *
 * Output: normalized JSON to stdout
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCategory } from "./lib/normalize-category.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

const tsvArg = process.argv[2];
if (!tsvArg) {
  console.error("Usage: bun scripts/normalize-tsv.js <path-to-tsv>");
  process.exit(1);
}

// Resolve to a path relative to repo root for matching against race-info.json
const absoluteTsvPath = resolve(tsvArg);
const relativeTsvPath = absoluteTsvPath.startsWith(`${repoRoot}/`)
  ? absoluteTsvPath.slice(repoRoot.length + 1)
  : tsvArg;

// Load race-info.json and find the matching category definition
const raceInfo = JSON.parse(
  readFileSync(join(repoRoot, "race-info.json"), "utf-8"),
);

let matchedCategory = null;
let matchedEdition = null;
let matchedEvent = null;

outer: for (const event of raceInfo.events) {
  for (const edition of event.editions) {
    for (const category of edition.categories) {
      if (category.result_tsv === relativeTsvPath) {
        matchedCategory = category;
        matchedEdition = edition;
        matchedEvent = event;
        break outer;
      }
    }
  }
}

if (!matchedCategory) {
  console.error(
    `Error: No category definition found for "${relativeTsvPath}" in race-info.json`,
  );
  process.exit(1);
}

// Read and normalize the TSV
const tsvContent = readFileSync(absoluteTsvPath, "utf-8");
const { athletes, warnings } = normalizeCategory(tsvContent, matchedCategory);

if (warnings.length > 0) {
  for (const w of warnings) {
    process.stderr.write(`Warning: ${w}\n`);
  }
}

const output = {
  event: matchedEvent.id,
  date: matchedEdition.date,
  category: {
    id: matchedCategory.id,
    name: matchedCategory.name,
    distance: matchedCategory.distance,
    description: matchedCategory.description,
  },
  athletes,
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
process.stderr.write(`Done: ${athletes.length} athletes normalized.\n`);
