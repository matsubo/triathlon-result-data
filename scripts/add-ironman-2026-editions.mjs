// Add 2026 editions (race-info.json) for 9 already-raced IRONMAN events, cloning
// each event's latest existing edition mapping. Also emit the subevents file for
// fetch-ironman-results.js. No weather (IRONMAN editions carry none).
import { readFileSync, writeFileSync } from "node:fs";

const NEW = [
  { id: "im703_hawaii",        sub: "48c22436-2d66-4967-9ddb-544922637b96", date: "2026-05-30", name: "2026 IRONMAN 70.3 Hawaii" },
  { id: "im703_kraichgau",     sub: "8abbf5d3-4be5-42a4-b40d-c2b126f9ad4d", date: "2026-05-31", name: "2026 IRONMAN 70.3 Kraichgau" },
  { id: "ironman_brazil",      sub: "63552a0f-493d-4627-841d-5715d5ba77f8", date: "2026-05-31", name: "2026 IRONMAN Brazil" },
  { id: "im703_bolton",        sub: "f9602ecf-26c0-419d-a50a-559b87c822f9", date: "2026-06-07", name: "2026 IRONMAN 70.3 Bolton" },
  { id: "im703_western_mass",  sub: "d71d387f-d08e-435f-8a2c-5b5beb3d560a", date: "2026-06-07", name: "2026 IRONMAN 70.3 Western Massachusetts" },
  { id: "im703_switzerland",   sub: "58a2f801-be0d-4a8d-9310-7eb90c565491", date: "2026-06-07", name: "2026 IRONMAN 70.3 Switzerland" },
  { id: "im703_warsaw",        sub: "8c4bf5be-c4b9-450f-8f4a-17a2bd78f984", date: "2026-06-07", name: "2026 IRONMAN 70.3 Warsaw" },
  { id: "ironman_hamburg",     sub: "be0a788d-bcd7-4710-a756-fb096a5e1591", date: "2026-06-07", name: "2026 IRONMAN Hamburg" },
  { id: "im703_goseong_korea", sub: "f0ac4ace-2dab-4adb-8f11-bc945fa39c22", date: "2026-06-14", name: "2026 IRONMAN 70.3 Goseong" },
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
  // latest existing edition by date
  const latest = ev.editions.reduce((a, b) => (a.date > b.date ? a : b));
  const cats = JSON.parse(JSON.stringify(latest.categories)).map((c) => ({
    ...c,
    id: `${n.id}_2026`,
    result_tsv: `master/2026/${n.id}_2026/default.tsv`,
    description: n.name,
  }));
  const edition = { date: n.date, categories: cats };
  // insert matching the event's existing order direction (minimise diff)
  const newestFirst = ev.editions[0].date >= ev.editions[ev.editions.length - 1].date;
  if (newestFirst) ev.editions.unshift(edition);
  else ev.editions.push(edition);
  subevents[n.id] = { subevent_uuid: n.sub, year: 2026, name: n.name };
}

writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
writeFileSync("scripts/ironman-2026-missing-subevents.json", `${JSON.stringify(subevents, null, 2)}\n`);
console.log(`Added ${NEW.length} IRONMAN 2026 editions; wrote subevents file.`);
