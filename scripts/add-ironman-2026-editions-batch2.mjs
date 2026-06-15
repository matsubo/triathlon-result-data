// Batch 2: add 2026 editions for 3 newly-raced IRONMAN events (Boulder 70.3,
// Cairns 70.3, Cairns full), cloning each event's latest edition mapping.
// Emits subevents file for fetch-ironman-results.js. No weather (IRONMAN).
import { readFileSync, writeFileSync } from "node:fs";

const NEW = [
  { id: "im703_boulder",  sub: "cc0ebae3-ade5-421b-a6b7-3f0270aee34e", date: "2026-06-13", name: "2026 IRONMAN 70.3 Boulder" },
  { id: "im703_cairns",   sub: "16208fe4-27d5-4e18-8b10-eab43b5c6ec3", date: "2026-06-14", name: "2026 IRONMAN 70.3 Cairns" },
  { id: "ironman_cairns", sub: "f87c8bbe-cb97-4f2c-83a7-e25d629870b1", date: "2026-06-14", name: "2026 IRONMAN Cairns" },
];

const path = "race-info.json";
const data = JSON.parse(readFileSync(path, "utf8"));
const subevents = {};

for (const n of NEW) {
  const ev = data.events.find((e) => e.id === n.id);
  if (!ev) { console.error(`MISSING EVENT ${n.id}`); process.exit(1); }
  if (ev.editions.some((e) => e.date.startsWith("2026"))) { console.error(`ALREADY 2026: ${n.id}`); process.exit(1); }
  const latest = ev.editions.reduce((a, b) => (a.date > b.date ? a : b));
  const cats = JSON.parse(JSON.stringify(latest.categories)).map((c) => ({
    ...c,
    id: `${n.id}_2026`,
    result_tsv: `master/2026/${n.id}_2026/default.tsv`,
    description: n.name,
  }));
  const edition = { date: n.date, categories: cats };
  const newestFirst = ev.editions[0].date >= ev.editions[ev.editions.length - 1].date;
  if (newestFirst) ev.editions.unshift(edition); else ev.editions.push(edition);
  subevents[n.id] = { subevent_uuid: n.sub, year: 2026, name: n.name };
}

writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
writeFileSync("scripts/ironman-2026-missing-subevents-batch2.json", `${JSON.stringify(subevents, null, 2)}\n`);
console.log(`Added ${NEW.length} IRONMAN 2026 editions (batch 2).`);
