// Add 4 IRONMAN 70.3 editions found by the 2026-09-07 /import-race discovery run.
// Three clone their event's latest existing edition mapping; IRONMAN 70.3 Baku
// is a brand-new event (inaugural 2026-09-05 edition, the only subevent on the
// labs-v2 event page) and therefore also gets an event entry + image.
import { readFileSync, writeFileSync } from "node:fs";

const NEW = [
  { id: "im703_zell_am_see", sub: "f40d667a-c78e-4da8-bfeb-a2041c951226", date: "2026-08-30", year: 2026, name: "2026 IRONMAN 70.3 Zell am See-Kaprun" },
  { id: "im703_poznan", sub: "92f91ff5-f329-4355-8075-f76cdee57f99", date: "2026-08-30", year: 2026, name: "2026 IRONMAN 70.3 Poznan" },
  { id: "im703_knokke_heist", sub: "0ee326bd-a4a9-4e1c-829c-2dcaae9af03f", date: "2026-09-06", year: 2026, name: "2026 IRONMAN 70.3 Knokke-Heist" },
  { id: "im703_baku", sub: "fc03a835-b0f1-4b46-a1d0-2bc44065993d", date: "2026-09-05", year: 2026, name: "2026 IRONMAN 70.3 Baku" },
];

const NEW_EVENT = {
  id: "im703_baku",
  name: "IRONMAN 70.3 Baku",
  location: "Baku, Azerbaijan",
  location_parts: { country: "AZ", city: "Baku" },
  image: "images/im703_baku.webp",
  source: "https://www.ironman.com/races/im703-baku",
};

// Standard 70.3 mapping, matching every other IRONMAN edition in this repo.
// T1/T2 exist in the fetched TSV but are deliberately not mapped (0 of 2063
// existing IRONMAN categories map them).
const templateCategory = (n) => ({
  id: `${n.id}_${n.year}`,
  result_tsv: `master/${n.year}/${n.id}_${n.year}/default.tsv`,
  name: "70.3",
  distance: "MD",
  description: n.name,
  segments: [
    { sport: "swim", distance: 1.9, columns: [{ header: "Swim", role: "lap" }] },
    { sport: "bike", distance: 90, columns: [{ header: "Bike", role: "lap" }] },
    { sport: "run", distance: 21.1, columns: [{ header: "Run", role: "lap" }] },
  ],
  meta_columns: [
    { header: "ContactId", role: "athlete_id" },
    { header: "Overall_Rank", role: "overall_rank" },
    { header: "Name", role: "name" },
    { header: "Gender", role: "gender" },
    { header: "Division", role: "age_category" },
    { header: "Div_Rank", role: "age_rank" },
    { header: "Total_Time", role: "total_time" },
    { header: "Country", role: "residence" },
    { header: "Status", role: "status" },
  ],
  source_url: null,
});

const path = "race-info.json";
const data = JSON.parse(readFileSync(path, "utf8"));
const before = data.events.length;
const subevents = {};

for (const n of NEW) {
  let ev = data.events.find((e) => e.id === n.id);

  if (!ev) {
    if (n.id !== NEW_EVENT.id) {
      console.error(`MISSING EVENT ${n.id}`);
      process.exit(1);
    }
    ev = { ...NEW_EVENT, editions: [] };
    data.events.unshift(ev);
    console.log(`created new event ${ev.id}`);
  }

  if (ev.editions.some((e) => e.date === n.date)) {
    console.error(`ALREADY has edition on ${n.date}: ${n.id}`);
    process.exit(1);
  }

  const latest = ev.editions.length ? ev.editions.reduce((a, b) => (a.date > b.date ? a : b)) : null;
  const cats = latest
    ? JSON.parse(JSON.stringify(latest.categories)).map((c) => ({
        ...c,
        id: `${n.id}_${n.year}`,
        result_tsv: `master/${n.year}/${n.id}_${n.year}/default.tsv`,
        description: n.name,
      }))
    : [templateCategory(n)];

  const edition = {
    date: n.date,
    weather_file: `master/${n.year}/${n.id}_${n.year}/weather-data.json`,
    categories: cats,
  };

  const newestFirst = !latest || ev.editions[0].date >= ev.editions[ev.editions.length - 1].date;
  if (newestFirst) ev.editions.unshift(edition);
  else ev.editions.push(edition);

  subevents[n.id] = { subevent_uuid: n.sub, year: n.year, name: n.name };
}

writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
writeFileSync("scripts/ironman-2026-batch10-subevents.json", `${JSON.stringify(subevents, null, 2)}\n`);
console.log(`Added ${NEW.length} IRONMAN editions (events ${before} -> ${data.events.length}); wrote subevents file.`);
