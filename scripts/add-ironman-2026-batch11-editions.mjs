// Add 14 IRONMAN / IRONMAN 70.3 editions found by the 2026-10-04 /import-race
// discovery run (races of 2026-09-13 .. 2026-09-27). Every event already exists,
// so each edition clones its event's latest edition mapping — except
// im703_weymouth, whose 2025 edition was swim-cancelled (bike-run only); 2026 had
// a full swim, so it gets the standard 70.3 template instead.
import { readFileSync, writeFileSync } from "node:fs";

const NEW = [
  { id: "ironman_wisconsin", sub: "1226621d-a297-4b14-aa34-f08811a460f3", date: "2026-09-13", name: "2026 IRONMAN Wisconsin" },
  { id: "im703_santa_cruz", sub: "fac8db48-5526-4b45-9709-d73e864b6278", date: "2026-09-13", name: "2026 IRONMAN 70.3 Santa Cruz" },
  { id: "ironman_wales", sub: "c116f798-7f84-4d9c-a513-2603642b90ce", date: "2026-09-13", name: "2026 IRONMAN Wales" },
  { id: "im703_belgrade", sub: "ff9f63b6-57ad-4cbb-8fe4-578aabcba1a6", date: "2026-09-13", name: "2026 IRONMAN 70.3 Belgrade" },
  { id: "ironman_maryland", sub: "46e754db-2cb0-4a75-b9ad-2b9d0140a90e", date: "2026-09-19", name: "2026 IRONMAN Maryland" },
  { id: "ironman_italy", sub: "29e186db-f6bc-4393-93cd-992737521f2a", date: "2026-09-19", name: "2026 IRONMAN Italy Emilia Romagna" },
  { id: "im703_italy_emilia_romagna", sub: "54d56e50-9c53-48bc-a317-86313efe3938", date: "2026-09-20", name: "2026 IRONMAN 70.3 Italy Emilia Romagna" },
  { id: "im703_sao_paulo", sub: "3bc09d29-8131-4efa-af79-8257b58114a3", date: "2026-09-20", name: "2026 IRONMAN 70.3 Sao Paulo" },
  { id: "im703_weymouth", sub: "57843283-6d31-4682-8630-88ed38ebd1f0", date: "2026-09-20", name: "2026 IRONMAN 70.3 Weymouth", template: true },
  { id: "im703_washington_tri_cities", sub: "ca676747-0220-4761-9043-5cc6525b354a", date: "2026-09-20", name: "2026 IRONMAN 70.3 Washington Tri-Cities" },
  { id: "im703_michigan", sub: "4d9e4392-ca94-4e7e-b47f-1c929b257a9e", date: "2026-09-20", name: "2026 IRONMAN 70.3 Michigan" },
  { id: "im703_cozumel", sub: "f77ac398-ef29-4c13-8fd5-06bd4cd1151b", date: "2026-09-20", name: "2026 IRONMAN 70.3 Cozumel" },
  { id: "im703_augusta", sub: "9ef62436-f5df-455c-b97b-e96fe5afe36c", date: "2026-09-27", name: "2026 IRONMAN 70.3 Augusta" },
  { id: "ironman_chattanooga", sub: "002a44d9-34a7-4f44-bb46-dc254e3fcee9", date: "2026-09-27", name: "2026 IRONMAN Chattanooga" },
];

const YEAR = 2026;

// Standard 70.3 mapping, matching every other IRONMAN edition in this repo.
const templateCategory = (n) => ({
  id: `${n.id}_${YEAR}`,
  result_tsv: `master/${YEAR}/${n.id}_${YEAR}/default.tsv`,
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
  const cats = n.template
    ? [templateCategory(n)]
    : JSON.parse(JSON.stringify(latest.categories)).map((c) => ({
        ...c,
        id: `${n.id}_${YEAR}`,
        result_tsv: `master/${YEAR}/${n.id}_${YEAR}/default.tsv`,
        description: n.name,
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
writeFileSync("scripts/ironman-2026-batch11-subevents.json", `${JSON.stringify(subevents, null, 2)}\n`);
console.log(`Added ${NEW.length} IRONMAN editions; wrote subevents file.`);
