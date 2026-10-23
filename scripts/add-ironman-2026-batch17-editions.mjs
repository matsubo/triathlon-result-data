// Add the IRONMAN 70.3 Porec 2026-10-18 edition found by the 2026-10-24
// /import-race sweep (its labs-v2 subevent appeared after the 10-22 sweep).
// The event already exists, so the edition clones its latest (2025, standard
// swim-bike-run course) edition mapping.
import { readFileSync, writeFileSync } from "node:fs";

const NEW = [
  {
    id: "im703_porec",
    sub: "ace7b6b3-6719-4888-9997-bea0cc93e123",
    name: "2026 IRONMAN 70.3 Porec",
    description: "IRONMAN 70.3 Porec 2026. Porec, Croatia.",
  },
];

const YEAR = 2026;
const DATE = "2026-10-18";

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

  const edition = { date: DATE, weather_file: `${dir}/weather-data.json`, categories: cats };
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
writeFileSync("scripts/ironman-2026-batch17-subevents.json", `${JSON.stringify(subevents, null, 2)}\n`);
console.log(`Added ${NEW.length} IRONMAN edition(s); wrote subevents file.`);
