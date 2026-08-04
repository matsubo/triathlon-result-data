// Add 2026 editions (race-info.json) for 5 already-raced IRONMAN 70.3 events found
// by the 2026-08-03 /import-race discovery run, cloning each event's latest existing
// edition mapping. Also emit the subevents file for fetch-ironman-results.js. Boise
// has two subevents (AG + PRO, disjoint contactids) — fetch-ironman-results.js only
// takes one, so Boise is fetched/merged separately.
import { readFileSync, writeFileSync } from "node:fs";

const NEW = [
  { id: "im703_boise", sub: "1d87f04c-925d-4196-ae91-bcc64e0fe0f7", date: "2026-07-25", name: "2026 IRONMAN 70.3 Boise" },
  { id: "im703_maine", sub: "cd9c9f3e-f50d-4488-9e3a-5603e616a985", date: "2026-07-26", name: "2026 IRONMAN 70.3 Maine" },
  { id: "im703_calgary", sub: "a4f59be8-575c-49f1-a5f8-43a9f755d77d", date: "2026-07-26", name: "2026 IRONMAN 70.3 Calgary" },
  { id: "im703_desaru_coast", sub: "b4a144d4-80d2-4553-b429-cbd1f890c497", date: "2026-07-26", name: "2026 IRONMAN 70.3 Desaru Coast" },
  { id: "im703_krakow", sub: "5ef1faa0-7bb5-4aed-8e99-487af9dc358f", date: "2026-08-02", name: "2026 IRONMAN 70.3 Krakow" },
];

const path = "race-info.json";
const data = JSON.parse(readFileSync(path, "utf8"));
const subevents = {};

for (const n of NEW) {
  const ev = data.events.find((e) => e.id === n.id);
  if (!ev) { console.error(`MISSING EVENT ${n.id}`); process.exit(1); }
  if (ev.editions.some((e) => e.date.startsWith("2026"))) {
    console.error(`ALREADY has 2026 edition: ${n.id}`); process.exit(1);
  }
  const latest = ev.editions.reduce((a, b) => (a.date > b.date ? a : b));
  const cats = JSON.parse(JSON.stringify(latest.categories)).map((c) => ({
    ...c,
    id: `${n.id}_2026`,
    result_tsv: `master/2026/${n.id}_2026/default.tsv`,
    description: n.name,
  }));
  const edition = { date: n.date, categories: cats };
  const newestFirst = ev.editions[0].date >= ev.editions[ev.editions.length - 1].date;
  if (newestFirst) ev.editions.unshift(edition);
  else ev.editions.push(edition);
  subevents[n.id] = { subevent_uuid: n.sub, year: 2026, name: n.name };
}

writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
writeFileSync("scripts/ironman-2026-batch7-subevents.json", `${JSON.stringify(subevents, null, 2)}\n`);
console.log(`Added ${NEW.length} IRONMAN 70.3 2026 editions; wrote subevents file.`);
