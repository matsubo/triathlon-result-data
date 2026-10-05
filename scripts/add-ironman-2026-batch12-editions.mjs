// Add the IRONMAN 70.3 Buenos Aires 2026 edition (raced 2026-10-04), found by
// the 2026-10-05 /import-race re-sweep. The event exists; the edition clones the
// 2025 edition's mapping (a normal full-course year, not a modified one).
import { readFileSync, writeFileSync } from "node:fs";

const NEW = [
  { id: "im703_buenos_aires", sub: "f6eb1d37-6576-4b68-9cf6-e6df97fa31f3", date: "2026-10-04", name: "2026 IRONMAN 70.3 Buenos Aires" },
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
  if (ev.editions.some((e) => e.date === n.date)) {
    console.error(`ALREADY has edition on ${n.date}: ${n.id}`);
    process.exit(1);
  }

  const latest = ev.editions.reduce((a, b) => (a.date > b.date ? a : b));
  const cats = JSON.parse(JSON.stringify(latest.categories)).map((c) => ({
    ...c,
    id: `${n.id}_${YEAR}`,
    result_tsv: `master/${YEAR}/${n.id}_${YEAR}/default.tsv`,
    description: n.name,
  }));

  const edition = {
    date: n.date,
    weather_file: `master/${YEAR}/${n.id}_${YEAR}/weather-data.json`,
    categories: cats,
  };

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
writeFileSync("scripts/ironman-2026-batch12-subevents.json", `${JSON.stringify(subevents, null, 2)}\n`);
console.log(`Added ${NEW.length} IRONMAN editions; wrote subevents file.`);
