// Add 2026 editions (race-info.json) for 7 already-raced IRONMAN/70.3 events found
// by the 2026-08-24 /import-race discovery run, cloning each event's latest existing
// edition mapping. All 7 events already carry weather_file on their latest edition,
// so the new editions get one too (per the ironman_ottawa precedent).
import { readFileSync, writeFileSync } from "node:fs";

const NEW = [
  { id: "ironman_leeds", sub: "277ae1e3-2400-4862-9fa0-96f0faf17ede", date: "2026-08-16", name: "2026 IRONMAN Leeds" },
  { id: "ironman_copenhagen", sub: "f02e7dca-4e7f-4fc4-a750-6670e8eddc08", date: "2026-08-16", name: "2026 IRONMAN Copenhagen" },
  { id: "im703_duisburg", sub: "b61f8e76-3434-4b88-933c-73b8ea7454a8", date: "2026-08-16", name: "2026 IRONMAN 70.3 Duisburg" },
  { id: "im703_rio_de_janeiro", sub: "0b6fe41e-b0cf-4746-b947-10ef5ed969f0", date: "2026-08-09", name: "2026 IRONMAN 70.3 Rio de Janeiro" },
  { id: "im703_hradec_kralove", sub: "606dae50-dab9-4036-a694-a2dfa3754217", date: "2026-08-16", name: "2026 IRONMAN 70.3 Hradec Kralove" },
  { id: "im703_venice", sub: "67f45085-43ba-4032-a80d-4d9605eb4466", date: "2026-05-03", name: "2026 IRONMAN 70.3 Venice-Jesolo" },
  { id: "ironman_sweden", sub: "59f3b68c-c706-4a5c-b028-3ed9389d5422", date: "2026-08-15", name: "2026 IRONMAN Sweden" },
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
    id: `${n.id}_2026`,
    result_tsv: `master/2026/${n.id}_2026/default.tsv`,
    description: n.name,
  }));
  const edition = {
    date: n.date,
    weather_file: `master/2026/${n.id}_2026/weather-data.json`,
    categories: cats,
  };
  const newestFirst = ev.editions[0].date >= ev.editions[ev.editions.length - 1].date;
  if (newestFirst) ev.editions.unshift(edition);
  else ev.editions.push(edition);
  subevents[n.id] = { subevent_uuid: n.sub, year: 2026, name: n.name };
}

writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
writeFileSync("scripts/ironman-2026-batch8-subevents.json", `${JSON.stringify(subevents, null, 2)}\n`);
console.log(`Added ${NEW.length} IRONMAN 2026 editions; wrote subevents file.`);
