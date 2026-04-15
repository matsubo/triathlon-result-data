/**
 * normalize-tsv.js
 *
 * Output normalized JSON for a specific race edition.
 *
 * Usage:
 *   bun scripts/normalize-tsv.js <event_id> <year>
 *
 * Examples:
 *   bun scripts/normalize-tsv.js ironman_cairns 2025
 *   bun scripts/normalize-tsv.js sado 2024
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCategory } from "./lib/normalize-category.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

const [eventId, yearArg] = process.argv.slice(2);
if (!eventId || !yearArg) {
  process.stderr.write(
    "Usage: bun scripts/normalize-tsv.js <event_id> <year>\n",
  );
  process.stderr.write(
    "  e.g. bun scripts/normalize-tsv.js ironman_cairns 2025\n",
  );
  process.exit(1);
}
const year = yearArg.trim();

const raceInfo = JSON.parse(
  readFileSync(join(repoRoot, "race-info.json"), "utf-8"),
);

const event = raceInfo.events.find((e) => e.id === eventId);
if (!event) {
  process.stderr.write(
    `Error: event "${eventId}" not found in race-info.json\n`,
  );
  process.exit(1);
}

const edition = event.editions.find((ed) => ed.date.startsWith(year));
if (!edition) {
  process.stderr.write(
    `Error: no edition found for event "${eventId}" in year ${year}\n`,
  );
  process.exit(1);
}

let weather = null;
if (edition.weather_file) {
  try {
    weather = JSON.parse(
      readFileSync(join(repoRoot, edition.weather_file), "utf-8"),
    );
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    process.stderr.write(
      `Warning: weather file not found: ${edition.weather_file}\n`,
    );
  }
}

const categories = edition.categories.map((category) => {
  const tsvContent = readFileSync(join(repoRoot, category.result_tsv), "utf-8");
  const { athletes, warnings } = normalizeCategory(tsvContent, category);
  for (const w of warnings) {
    process.stderr.write(`Warning: ${w}\n`);
  }
  return {
    id: category.id,
    name: category.name,
    distance: category.distance,
    description: category.description,
    segments: category.segments.map((seg) => ({
      sport: seg.sport,
      distance_km: seg.distance,
    })),
    athletes,
  };
});

const output = {
  event_id: event.id,
  name: event.name,
  location: event.location,
  date: edition.date,
  weather,
  categories,
};

process.stdout.write(`${JSON.stringify(output)}\n`);
