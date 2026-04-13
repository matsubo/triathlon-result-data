/**
 * Insert Ironman Canada event (10 editions) into race-info.json.
 * One-shot importer — safe to re-run (will skip if event already exists).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const raceInfoPath = join(repoRoot, "race-info.json");

const EDITIONS = [
  { year: 2024, date: "2024-08-25", coachcox: 2149 },
  { year: 2022, date: "2022-08-28", coachcox: 1774 },
  { year: 2019, date: "2019-07-28", coachcox: 488 },
  { year: 2018, date: "2018-07-29", coachcox: 439 },
  { year: 2017, date: "2017-07-30", coachcox: 385 },
  { year: 2016, date: "2016-07-24", coachcox: 336 },
  { year: 2015, date: "2015-07-26", coachcox: 291 },
  { year: 2014, date: "2014-07-27", coachcox: 244 },
  { year: 2013, date: "2013-08-25", coachcox: 217 },
  { year: 2012, date: "2012-08-26", coachcox: 1947 },
];

function buildEdition({ year, date }) {
  return {
    date,
    categories: [
      {
        id: `ironman_canada_${year}`,
        result_tsv: `master/${year}/ironman_canada_${year}/default.tsv`,
        name: "Full Distance",
        distance: "LD",
        description: `${year} IRONMAN Canada`,
        segments: [
          {
            sport: "swim",
            distance: 3.8,
            columns: [{ header: "Swim", role: "lap" }],
          },
          {
            sport: "bike",
            distance: 180.2,
            columns: [{ header: "Bike", role: "lap" }],
          },
          {
            sport: "run",
            distance: 42.195,
            columns: [{ header: "Run", role: "lap" }],
          },
        ],
        meta_columns: [
          { header: "ContactId", role: "athlete_id" },
          { header: "Overall_Rank", role: "overall_rank" },
          { header: "Name", role: "name" },
          { header: "Gender", role: "gender" },
          { header: "Division", role: "age_category" },
          { header: "Div_Rank", role: "age_rank" },
          { header: "Total_Time", role: "total_time" },
          { header: "Country", role: "residence" },
          { header: "Status", role: "status" },
        ],
      },
    ],
  };
}

const event = {
  id: "ironman_canada",
  name: "IRONMAN Canada",
  location: "Penticton / Whistler, BC, Canada",
  image: "images/ironman_canada.webp",
  source: "https://www.coachcox.co.uk/imstats/series/35/",
  editions: EDITIONS.map(buildEdition),
};

const data = JSON.parse(readFileSync(raceInfoPath, "utf-8"));
const existing = data.events.findIndex((e) => e.id === "ironman_canada");
if (existing >= 0) {
  data.events[existing] = event;
  console.log("Replaced existing ironman_canada event");
} else {
  const insertAfter = data.events.findIndex((e) => e.id === "ironman_cairns");
  if (insertAfter < 0) throw new Error("anchor ironman_cairns not found");
  data.events.splice(insertAfter + 1, 0, event);
  console.log(`Inserted ironman_canada after ironman_cairns (index ${insertAfter + 1})`);
}

writeFileSync(raceInfoPath, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Wrote ${raceInfoPath}`);
