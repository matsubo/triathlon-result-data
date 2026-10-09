// Add 2 IRONMAN / IRONMAN 70.3 editions found by the 2026-10-09 /import-race
// discovery run (races of 2026-10-04, not yet posted on 2026-10-05). Every event already exists, so each
// edition clones its event's latest edition mapping. IRONMAN 70.3 Waco 2026 had
// its swim cancelled (Brazos River conditions, KWTX 2026-10-03; 0/2444 rows carry
// a swim split), so its swim segment is dropped, as for im703_dallas 2026.
import { readFileSync, writeFileSync } from "node:fs";

const NEW = [
  { id: "ironman_gurye", sub: "297b77b0-c4ac-41de-9bf4-a7b3daa1fff7", date: "2026-10-04", name: "2026 IRONMAN Gurye Korea" },
  {
    id: "im703_waco",
    sub: "190ed93a-7bd5-420b-ae54-46e9c970e9b1",
    date: "2026-10-04",
    name: "2026 IRONMAN 70.3 Waco",
    swimCancelled: true,
  },
];

const YEAR = 2026;
const SWIM_CANCELLED = "Swim was cancelled due to conditions; race held as bike+run only.";

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
    description: n.swimCancelled ? `${n.name}. ${SWIM_CANCELLED}` : n.name,
    segments: n.swimCancelled ? c.segments.filter((s) => s.sport !== "swim") : c.segments,
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
writeFileSync("scripts/ironman-2026-batch13-subevents.json", `${JSON.stringify(subevents, null, 2)}\n`);
console.log(`Added ${NEW.length} IRONMAN editions; wrote subevents file.`);
