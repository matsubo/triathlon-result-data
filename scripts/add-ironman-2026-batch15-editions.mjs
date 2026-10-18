// Add the 3 IRONMAN / IRONMAN 70.3 editions of 2026-10-17 found by the
// 2026-10-19 /import-race sweep. Every event already exists, so each edition
// clones its event's latest edition mapping (all three 2025 editions held the
// standard swim / bike / run course, and every 2026 finisher has a swim split).
import { readFileSync, writeFileSync } from "node:fs";

const NEW = [
  { id: "im703_north_carolina", sub: "151a488f-08ca-4b08-a63a-c9272aab277e", date: "2026-10-17", name: "2026 IRONMAN 70.3 North Carolina" },
  { id: "im703_portugal_cascais", sub: "d2d69985-cef9-45e2-af7e-fca78c04f26b", date: "2026-10-17", name: "2026 IRONMAN 70.3 Portugal-Cascais" },
  { id: "ironman_portugal", sub: "54ee90cf-27dc-4a8a-8ee9-f9e83957b758", date: "2026-10-17", name: "2026 IRONMAN Portugal-Cascais" },
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
  const dir = `master/${YEAR}/${n.id}_${YEAR}`;
  const cats = JSON.parse(JSON.stringify(latest.categories)).map((c) => ({
    ...c,
    id: `${n.id}_${YEAR}`,
    result_tsv: `${dir}/default.tsv`,
    description: n.name,
  }));

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
writeFileSync("scripts/ironman-2026-batch15-subevents.json", `${JSON.stringify(subevents, null, 2)}\n`);
console.log(`Added ${NEW.length} IRONMAN editions; wrote subevents file.`);
