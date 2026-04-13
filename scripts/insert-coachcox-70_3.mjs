/**
 * Insert/update Ironman 70.3 events in race-info.json based on
 * /tmp/import_plan_70_3.json and /tmp/import_results_70_3.json
 *
 * Auto-derives event name and location from coachcox series name
 * since manual metadata for 186 events is impractical.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const raceInfoPath = join(repoRoot, "race-info.json");

const plan = JSON.parse(readFileSync("/tmp/import_plan_70_3.json", "utf-8"));
const results = JSON.parse(
  readFileSync("/tmp/import_results_70_3.json", "utf-8"),
);

const importedSet = new Set(
  results.ok.map((r) => `${r.eventId}:${r.year}`),
);

function deriveLocation(seriesName) {
  return seriesName.replace(/^Ironman\s+70\.3\s+/i, "").trim();
}

function buildEdition(eventId, year, raceDate, displayName) {
  return {
    date: raceDate,
    categories: [
      {
        id: `${eventId}_${year}`,
        result_tsv: `master/${year}/${eventId}_${year}/default.tsv`,
        name: "70.3",
        distance: "MD",
        description: `${year} ${displayName}`,
        segments: [
          { sport: "swim", distance: 1.9,    columns: [{ header: "Swim", role: "lap" }] },
          { sport: "bike", distance: 90.1,   columns: [{ header: "Bike", role: "lap" }] },
          { sport: "run",  distance: 21.0975, columns: [{ header: "Run",  role: "lap" }] },
        ],
        meta_columns: [
          { header: "ContactId",    role: "athlete_id" },
          { header: "Overall_Rank", role: "overall_rank" },
          { header: "Name",         role: "name" },
          { header: "Gender",       role: "gender" },
          { header: "Division",     role: "age_category" },
          { header: "Div_Rank",     role: "age_rank" },
          { header: "Total_Time",   role: "total_time" },
          { header: "Country",      role: "residence" },
          { header: "Status",       role: "status" },
        ],
      },
    ],
  };
}

function epochToISODate(epoch, year) {
  if (!epoch) return year ? `${year}-01-01` : null;
  const d = new Date(Number(epoch) * 1000);
  return d.toISOString().slice(0, 10);
}

function buildNewEvent(newEv) {
  const location = deriveLocation(newEv.name);
  const editions = [...newEv.races]
    .filter((r) => importedSet.has(`${newEv.eventId}:${r.year}`))
    .sort((a, b) => Number(b.year) - Number(a.year))
    .map((r) =>
      buildEdition(
        newEv.eventId,
        r.year,
        epochToISODate(r.date, r.year),
        newEv.name,
      ),
    );
  return {
    id: newEv.eventId,
    name: newEv.name,
    location,
    image: `images/${newEv.eventId}.webp`,
    source: `https://www.coachcox.co.uk/imstats/series/${newEv.sid}/`,
    editions,
  };
}

const data = JSON.parse(readFileSync(raceInfoPath, "utf-8"));

// Insert new events at the end of im703 block. Find the last im703 event.
let lastIm703Idx = -1;
for (let i = 0; i < data.events.length; i++) {
  if (data.events[i].id.startsWith("im703")) lastIm703Idx = i;
}
if (lastIm703Idx < 0) throw new Error("No existing im703 event found as anchor");

let added = 0;
let filledEditions = 0;

for (const newEv of plan.newEvents) {
  if (data.events.some((e) => e.id === newEv.eventId)) continue;
  const event = buildNewEvent(newEv);
  if (event.editions.length === 0) continue;
  data.events.splice(lastIm703Idx + 1, 0, event);
  lastIm703Idx++;
  added++;
}

for (const ev of plan.missingYears) {
  const target = data.events.find((e) => e.id === ev.eventId);
  if (!target) {
    console.warn(`Existing event ${ev.eventId} not found, skipping fills`);
    continue;
  }
  const existingDates = new Set(target.editions.map((e) => e.date.slice(0, 4)));
  const newOnes = ev.missing
    .filter((r) => importedSet.has(`${ev.eventId}:${r.year}`))
    .filter((r) => !existingDates.has(String(r.year)))
    .map((r) =>
      buildEdition(
        ev.eventId,
        r.year,
        epochToISODate(r.date, r.year),
        target.name,
      ),
    );
  if (newOnes.length === 0) continue;
  target.editions.push(...newOnes);
  target.editions.sort((a, b) => b.date.localeCompare(a.date));
  filledEditions += newOnes.length;
}

writeFileSync(raceInfoPath, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Added ${added} new 70.3 events, filled ${filledEditions} missing editions`);
