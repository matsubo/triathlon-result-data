// Add the 4 IRONMAN / IRONMAN 70.3 editions of 2026-10-18 found by the
// 2026-10-22 /import-race sweep. Every event already exists, so each edition
// clones its event's latest edition mapping. The 2025 IRONMAN Australia and
// 70.3 Port Macquarie editions were swim-cancelled (bike+run only); the 2026
// races held the swim, so the standard swim segment is restored for them
// (distances from their 2023/2024 swim-held editions).
import { readFileSync, writeFileSync } from "node:fs";

const NEW = [
  {
    id: "ironman_australia",
    sub: "e4eb745e-0f82-441d-a5e6-a5dc50053946",
    name: "2026 IRONMAN Australia",
    description: "IRONMAN Australia 2026. Port Macquarie, Australia.",
    swimKm: 3.8,
  },
  {
    id: "ironman_california",
    sub: "0122afc0-ade5-44d5-991e-86f0fd4dec30",
    name: "2026 IRONMAN California",
    description: "IRONMAN California 2026. Sacramento, California, USA.",
  },
  {
    id: "im703_florianopolis",
    sub: "8441a611-e0a4-4f23-ad2a-731afcf87d17",
    name: "2026 IRONMAN 70.3 Florianopolis",
    description: "2026 IRONMAN 70.3 Florianopolis",
  },
  {
    id: "im703_port_macquarie",
    sub: "58f1069d-8df9-4d2c-a10e-9033da2dc0b6",
    name: "2026 IRONMAN 70.3 Port Macquarie",
    description: "IRONMAN 70.3 Port Macquarie 2026. Port Macquarie, Australia.",
    swimKm: 1.9,
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
    const segments = c.segments.some((s) => s.sport === "swim")
      ? c.segments
      : [{ sport: "swim", distance: n.swimKm, columns: [{ header: "Swim", role: "lap" }] }, ...c.segments];
    if (segments !== c.segments && n.swimKm == null) {
      console.error(`${n.id}: latest edition has no swim and no swimKm given`);
      process.exit(1);
    }
    return { ...c, id: `${n.id}_${YEAR}`, result_tsv: `${dir}/default.tsv`, description: n.description, segments };
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
writeFileSync("scripts/ironman-2026-batch16-subevents.json", `${JSON.stringify(subevents, null, 2)}\n`);
console.log(`Added ${NEW.length} IRONMAN editions; wrote subevents file.`);
