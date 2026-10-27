// Add the four IRONMAN 70.3 editions raced 2026-10-24/25 and found by the
// 2026-10-27 /import-race sweep. Every event already exists, so each edition
// clones its latest (2025, standard swim-bike-run course) edition mapping.
import { readFileSync, writeFileSync } from "node:fs";

const NEW = [
  {
    id: "im703_salalah",
    date: "2026-10-24",
    sub: "100cc5bf-7778-44f6-8740-07a86c71c781",
    name: "2026 IRONMAN 70.3 Dhofar",
    description: "IRONMAN 70.3 Dhofar 2026. Salalah, Oman.",
  },
  {
    id: "im703_new_york",
    date: "2026-10-24",
    sub: "c1a7ef77-dfd8-4cd7-a2dd-b22ab9e9d776",
    name: "2026 IRONMAN 70.3 New York",
    description: "IRONMAN 70.3 New York 2026. Jones Beach, New York, USA.",
  },
  {
    id: "im703_marathon",
    date: "2026-10-25",
    sub: "92bde9d4-4df9-4ca3-a116-3d49e0ceef43",
    name: "2026 IRONMAN 70.3 Costa Navarino, Peloponnese, Greece",
    description: "IRONMAN 70.3 Greece 2026. Costa Navarino, Peloponnese, Greece.",
  },
  {
    id: "im703_agadir",
    date: "2026-10-25",
    sub: "1929cc35-e4fd-4a2c-8991-c1cdb7036b2a",
    name: "2026 IRONMAN 70.3 Agadir",
    description: "IRONMAN 70.3 Agadir 2026. Agadir, Morocco.",
  },
];

const YEAR = 2026;

const path = "race-info.json";
const data = JSON.parse(readFileSync(path, "utf8"));
const before = data.events.length;
const subevents = {};

for (const n of NEW) {
  const ev = data.events.find((e) => e.id === n.id);
  if (!ev) {
    console.error(`MISSING EVENT ${n.id}`);
    process.exit(1);
  }
  if (ev.editions.some((e) => e.date.startsWith(String(YEAR)))) {
    console.error(`ALREADY has a ${YEAR} edition: ${n.id}`);
    process.exit(1);
  }

  const latest = ev.editions.reduce((a, b) => (a.date > b.date ? a : b));
  const dir = `master/${YEAR}/${n.id}_${YEAR}`;
  const cats = JSON.parse(JSON.stringify(latest.categories)).map((c) => {
    if (!c.segments.some((s) => s.sport === "swim")) {
      console.error(`${n.id}: latest edition has no swim segment`);
      process.exit(1);
    }
    return { ...c, id: `${n.id}_${YEAR}`, result_tsv: `${dir}/default.tsv`, description: n.description };
  });

  const edition = { date: n.date, weather_file: `${dir}/weather-data.json`, categories: cats };
  const newestFirst = ev.editions[0].date >= ev.editions[ev.editions.length - 1].date;
  if (newestFirst) ev.editions.unshift(edition);
  else ev.editions.push(edition);

  subevents[n.id] = { subevent_uuid: n.sub, year: YEAR, name: n.name };
}

if (data.events.length !== before) {
  console.error("event count changed");
  process.exit(1);
}
writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
writeFileSync("scripts/ironman-2026-batch18-subevents.json", `${JSON.stringify(subevents, null, 2)}\n`);
console.log(`Added ${NEW.length} IRONMAN edition(s); wrote subevents file.`);
