/**
 * Generate race-info.json entries for all 2025 Ironman races
 * Reads from scripts/ironman-2025-scrape-results.json and checks which TSVs exist
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const results = JSON.parse(readFileSync(join(__dirname, "ironman-2025-scrape-results.json"), "utf-8"));

function makeEntry(race) {
  const tsvPath = `master/2025/${race.id}/default.tsv`;
  const fullPath = join(repoRoot, tsvPath);
  if (!existsSync(fullPath)) return null;

  const isFullDist = race.dist === "LD";
  const swimDist = isFullDist ? 3.8 : 1.9;
  const bikeDist = isFullDist ? 180.2 : 90.0;
  const runDist  = isFullDist ? 42.195 : 21.1;

  return {
    id: race.id,
    name: race.name,
    location: race.location,
    image: `images/${race.id}.webp`,
    source: `https://www.coachcox.co.uk/imstats/race/${race.coachcox}/results/`,
    editions: [
      {
        date: race.date,
        categories: [
          {
            id: race.id,
            result_tsv: tsvPath,
            name: isFullDist ? "Full Distance" : "Half Distance",
            distance: race.dist,
            description: `${race.name} ${race.date.slice(0, 4)}. ${race.location}.`,
            segments: [
              {
                sport: "swim",
                distance: swimDist,
                columns: [{ header: "Swim", role: "lap" }],
              },
              {
                sport: "bike",
                distance: bikeDist,
                columns: [{ header: "Bike", role: "lap" }],
              },
              {
                sport: "run",
                distance: runDist,
                columns: [{ header: "Run", role: "lap" }],
              },
            ],
            meta_columns: [
              { header: "Overall_Rank", role: "overall_rank" },
              { header: "Name", role: "name" },
              { header: "Gender", role: "gender" },
              { header: "Division", role: "age_category" },
              { header: "Div_Rank", role: "age_rank" },
              { header: "Total_Time", role: "total_time" },
            ],
          },
        ],
      },
    ],
  };
}

const raceInfo = JSON.parse(readFileSync(join(repoRoot, "race-info.json"), "utf-8"));

// Remove the already-added ironman_south_hokkaido (we'll re-add via this script with consistent structure)
// Actually keep it if already there and just skip duplicates
const existingIds = new Set(raceInfo.events.map((e) => e.id));

let added = 0;
let skipped = 0;

for (const race of results) {
  if (race.id === "ironman_south_hokkaido_2025") {
    // Skip - already added but with different id "ironman_south_hokkaido"
    continue;
  }
  if (existingIds.has(race.id)) {
    skipped++;
    continue;
  }
  const entry = makeEntry(race);
  if (!entry) {
    console.log(`⚠️  Skipping ${race.name} - no TSV file`);
    continue;
  }
  raceInfo.events.push(entry);
  existingIds.add(race.id);
  added++;
  console.log(`✅ Added ${race.name} (${race.id})`);
}

writeFileSync(join(repoRoot, "race-info.json"), JSON.stringify(raceInfo, null, 2) + "\n");
console.log(`\nDone: added ${added}, skipped ${skipped}`);
