// Add 2026 editions (race-info.json) for 6 already-raced IRONMAN events, cloning
// each event's latest existing edition mapping. Also emit the subevents file for
// fetch-ironman-results.js. No weather (IRONMAN editions carry none).
import { readFileSync, writeFileSync } from "node:fs";

const NEW = [
  { id: "ironman_philippines", sub: "496ef6de-1496-4f6a-859a-673177decaa4", date: "2026-06-07", name: "2026 IRONMAN Philippines" },
  { id: "im703_durban",        sub: "acea2f39-e472-40d2-8c51-0759a4a90ae9", date: "2026-06-07", name: "2026 IRONMAN 70.3 Durban" },
  { id: "im703_victoria",      sub: "cfc722ea-248c-4a5c-9b9e-cf2a027a7ea0", date: "2026-05-24", name: "2026 IRONMAN 70.3 Victoria" },
  { id: "im703_subic_bay",     sub: "1da5c1dc-48da-4e8d-9865-9c068ca0643c", date: "2026-06-07", name: "2026 IRONMAN 70.3 Subic Bay" },
  { id: "im703_rockford",      sub: "0669b88d-ea67-45c5-8240-bf8bf2cfefdc", date: "2026-06-14", name: "2026 IRONMAN 70.3 Rockford" },
  { id: "im703_happy_valley",  sub: "fc1038ad-0a54-470f-b468-6108f91cd03c", date: "2026-06-14", name: "2026 IRONMAN 70.3 Pennsylvania Happy Valley" },
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
writeFileSync("scripts/ironman-2026-batch3-subevents.json", `${JSON.stringify(subevents, null, 2)}\n`);
console.log(`Added ${NEW.length} IRONMAN 2026 editions; wrote subevents file.`);
