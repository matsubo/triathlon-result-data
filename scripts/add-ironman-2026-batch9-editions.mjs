// Add 7 IRONMAN/70.3 editions found by the 2026-08-31 /import-race discovery
// run, cloning each event's latest existing edition mapping. All 7 events
// already carry weather_file on their latest edition. im703_brasilia's target
// date (2025-04-13) predates its only existing edition (2026-04-26) — a
// genuine earlier-year gap-fill, not a "next edition" add.
import { readFileSync, writeFileSync } from "node:fs";

const NEW = [
  { id: "im703_lapu_lapu", sub: "e39996ac-51ef-453d-9e9b-e77e9686b2c6", date: "2026-08-09", year: 2026, name: "2026 IRONMAN 70.3 Lapu-Lapu" },
  { id: "im703_brasilia", sub: "17785981-d268-467d-b88f-8535859e80c9", date: "2025-04-13", year: 2025, name: "2025 IRONMAN 70.3 Brasilia" },
  { id: "im703_greece", sub: "64898c01-9906-40e8-8489-3292efe293f5", date: "2025-10-26", year: 2025, name: "2025 IRONMAN 70.3 Greece" },
  { id: "im703_vichy", sub: "bb6009b9-8030-4f4b-84e5-c03be65c6f7c", date: "2026-08-23", year: 2026, name: "2026 IRONMAN 70.3 Vichy" },
  { id: "ironman_vichy", sub: "c087c96c-783f-4142-bc21-52d4cfc31532", date: "2026-08-23", year: 2026, name: "2026 IRONMAN Vichy" },
  { id: "ironman_tallinn", sub: "48b74ff4-543a-4a3d-b1e5-937a91902e9b", date: "2026-08-22", year: 2026, name: "2026 IRONMAN Tallinn" },
  { id: "im703_tallinn", sub: "ad933b6a-be02-4568-9a6e-fc0d86a3e6b3", date: "2026-08-23", year: 2026, name: "2026 IRONMAN 70.3 Tallinn" },
];

const path = "race-info.json";
const data = JSON.parse(readFileSync(path, "utf8"));
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
    id: `${n.id}_${n.year}`,
    result_tsv: `master/${n.year}/${n.id}_${n.year}/default.tsv`,
    description: n.name,
  }));
  const edition = {
    date: n.date,
    weather_file: `master/${n.year}/${n.id}_${n.year}/weather-data.json`,
    categories: cats,
  };
  const newestFirst = ev.editions[0].date >= ev.editions[ev.editions.length - 1].date;
  if (newestFirst) ev.editions.unshift(edition);
  else ev.editions.push(edition);
  subevents[n.id] = { subevent_uuid: n.sub, year: n.year, name: n.name };
}

writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
writeFileSync("scripts/ironman-2026-batch9-subevents.json", `${JSON.stringify(subevents, null, 2)}\n`);
console.log(`Added ${NEW.length} IRONMAN editions; wrote subevents file.`);
