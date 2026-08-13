// Add the 2026 IRONMAN Canada-Ottawa edition, found by the 2026-08-13 /import-race
// discovery run. Clones the existing 2025 edition's category mapping (same
// columns/segments — labs-v2 IRONMAN TSV format is stable year to year).
import { readFileSync, writeFileSync } from "node:fs";

const path = "race-info.json";
const data = JSON.parse(readFileSync(path, "utf8"));

const ev = data.events.find((e) => e.id === "ironman_ottawa");
if (!ev) {
  console.error("MISSING EVENT ironman_ottawa");
  process.exit(1);
}
if (ev.editions.some((e) => e.date.startsWith("2026"))) {
  console.error("ALREADY has 2026 edition");
  process.exit(1);
}

const latest = ev.editions.reduce((a, b) => (a.date > b.date ? a : b));
const cats = JSON.parse(JSON.stringify(latest.categories)).map((c) => ({
  ...c,
  id: "ironman_ottawa_2026",
  result_tsv: "master/2026/ironman_ottawa_2026/default.tsv",
  description: "2026 IRONMAN Canada-Ottawa",
}));

const edition = {
  date: "2026-08-02",
  weather_file: "master/2026/ironman_ottawa_2026/weather-data.json",
  categories: cats,
};

const newestFirst = ev.editions[0].date >= ev.editions[ev.editions.length - 1].date;
if (newestFirst) ev.editions.unshift(edition);
else ev.editions.push(edition);

writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
writeFileSync(
  "scripts/ironman-ottawa-2026-subevents.json",
  `${JSON.stringify(
    { ironman_ottawa: { subevent_uuid: "bf442555-30b5-4228-bfa4-5f8e621b6dd4", year: 2026, name: "2026 IRONMAN Canada-Ottawa" } },
    null,
    2,
  )}\n`,
);
console.log("Added ironman_ottawa 2026 edition; wrote subevents file.");
