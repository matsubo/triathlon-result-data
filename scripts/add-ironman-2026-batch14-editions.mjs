// Add 3 IRONMAN / IRONMAN 70.3 editions found by the 2026-10-13 /import-race
// discovery run (races of 2026-10-10 and 2026-10-11).
// - IRONMAN World Championship Kona 2026: men and women raced together in Kona
//   on one day (one subevent), so the edition goes on the existing Kona event.
// - IRONMAN 70.3 Encarnacion 2026: existing event; clones its latest edition.
// - IRONMAN 70.3 Versailles 2026: inaugural edition, NEW event. Postponed from
//   2026-07-12 (heatwave, prefecture request) to 2026-10-11; swim moved to the
//   Grand Canal. Mapping cloned from the im703_encarnacion 70.3 template.
import { readFileSync, writeFileSync } from "node:fs";

const YEAR = 2026;

const NEW = [
  {
    id: "ironman_world_championship_kona",
    sub: "d168bf62-9088-4d48-b46a-9c6f968f24da",
    date: "2026-10-10",
    name: "2026 IRONMAN World Championship",
    description:
      "2026年IRONMAN World Championship。2019年以来初めて男女同日開催となったコナでの世界選手権。",
  },
  {
    id: "im703_encarnacion",
    sub: "0c5f8a68-a310-420b-89c2-3db630f48090",
    date: "2026-10-11",
    name: "2026 IRONMAN 70.3 Encarnacion",
  },
  {
    id: "im703_versailles",
    sub: "dacb0799-d6f4-46af-9285-8550945b48f3",
    date: "2026-10-11",
    name: "2026 IRONMAN 70.3 Versailles",
    description:
      "2026 IRONMAN 70.3 Versailles. Inaugural edition, postponed from 2026-07-12 because of a heatwave; swim held in the Grand Canal of the Château de Versailles.",
    template: "im703_encarnacion",
    event: {
      id: "im703_versailles",
      name: "IRONMAN 70.3 Versailles",
      location: "Versailles, France",
      location_parts: { country: "FR", region: "Île-de-France", city: "Versailles" },
      image: "images/im703_versailles.webp",
      source: "https://www.ironman.com/races/im703-versailles",
    },
  },
];

const path = "race-info.json";
const data = JSON.parse(readFileSync(path, "utf8"));
const before = data.events.length;
const subevents = {};
const latestOf = (ev) => ev.editions.reduce((a, b) => (a.date > b.date ? a : b));

for (const n of NEW) {
  let ev = data.events.find((e) => e.id === n.id);
  if (n.event) {
    if (ev) {
      console.error(`EVENT ALREADY EXISTS ${n.id}`);
      process.exit(1);
    }
    ev = { ...n.event, editions: [] };
    data.events.unshift(ev);
  }
  if (!ev) {
    console.error(`MISSING EVENT ${n.id}`);
    process.exit(1);
  }
  if (ev.editions.some((e) => e.date === n.date)) {
    console.error(`ALREADY has edition on ${n.date}: ${n.id}`);
    process.exit(1);
  }

  const source = n.template
    ? latestOf(data.events.find((e) => e.id === n.template))
    : latestOf(ev);
  const dir = `master/${YEAR}/${n.id}_${YEAR}`;
  const cats = JSON.parse(JSON.stringify(source.categories)).map((c) => ({
    ...c,
    id: `${n.id}_${YEAR}`,
    result_tsv: `${dir}/default.tsv`,
    description: n.description ?? n.name,
  }));

  const edition = { date: n.date, weather_file: `${dir}/weather-data.json`, categories: cats };
  const newestFirst =
    ev.editions.length === 0 || ev.editions[0].date >= ev.editions[ev.editions.length - 1].date;
  if (newestFirst) ev.editions.unshift(edition);
  else ev.editions.push(edition);

  subevents[n.id] = { subevent_uuid: n.sub, year: YEAR, name: n.name };
}

const added = NEW.filter((n) => n.event).length;
if (data.events.length !== before + added) {
  console.error("unexpected event count change");
  process.exit(1);
}
writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
writeFileSync("scripts/ironman-2026-batch14-subevents.json", `${JSON.stringify(subevents, null, 2)}\n`);
console.log(`Added ${NEW.length} IRONMAN editions (${added} new event); wrote subevents file.`);
