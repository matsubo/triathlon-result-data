/**
 * normalize-tsv.js
 *
 * Output normalized JSON for one Edition (scripts/lib/edition-document.js).
 *
 * Usage:
 *   bun scripts/normalize-tsv.js <event_id> <year|date>
 *
 * The year must match exactly one Edition of the Event; when the Event ran
 * more than once that year, pass the full date (YYYY-MM-DD).
 *
 * Examples:
 *   bun scripts/normalize-tsv.js ironman_cairns 2025
 *   bun scripts/normalize-tsv.js sado 2024-09-01
 */

import { join } from "node:path";
import {
  AmbiguousEdition,
  EditionNotFound,
  editionDocument,
  SchemaInvalid,
} from "./lib/edition-document.js";
import { fsRepo } from "./lib/repo.js";

const [eventId, dateArg] = process.argv.slice(2);
if (!eventId || !dateArg) {
  process.stderr.write(
    "Usage: bun scripts/normalize-tsv.js <event_id> <year|date>\n",
  );
  process.stderr.write(
    "  e.g. bun scripts/normalize-tsv.js ironman_cairns 2025\n",
  );
  process.exit(1);
}

const repo = fsRepo(join(import.meta.dirname, ".."));

let result;
try {
  result = editionDocument(repo, eventId, dateArg.trim());
} catch (err) {
  if (err instanceof EditionNotFound || err instanceof AmbiguousEdition) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
  if (err instanceof SchemaInvalid) {
    for (const w of err.warnings) process.stderr.write(`Warning: ${w}\n`);
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
  throw err;
}

for (const w of result.warnings) process.stderr.write(`Warning: ${w}\n`);
process.stdout.write(`${JSON.stringify(result.document)}\n`);
