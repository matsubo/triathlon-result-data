/**
 * Insert/update Ironman events in race-info.json based on /tmp/import_plan.json
 * and /tmp/import_results.json (TSV files already on disk).
 *
 * - Adds new events with metadata + edition list
 * - Adds missing-year editions to existing events
 * - Skips empty (no-data) races
 *
 * Image policy: each new event gets `images/<eventId>.webp`. The file may not
 * exist yet — a separate script will fetch images.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const raceInfoPath = join(repoRoot, "race-info.json");

const plan = JSON.parse(readFileSync("/tmp/import_plan.json", "utf-8"));
const results = JSON.parse(readFileSync("/tmp/import_results.json", "utf-8"));

// Build set of (eventId, year) successfully imported
const importedSet = new Set(
  results.ok.map((r) => `${r.eventId}:${r.year}`),
);

// New event metadata — name + location for each new event
const NEW_EVENT_META = {
  ironman_coeur_dalene:        { name: "IRONMAN Coeur d'Alene",         location: "Coeur d'Alene, Idaho, USA" },
  ironman_cozumel:             { name: "IRONMAN Cozumel",               location: "Cozumel, Mexico" },
  ironman_lake_placid:         { name: "IRONMAN Lake Placid",           location: "Lake Placid, New York, USA" },
  ironman_louisville:          { name: "IRONMAN Louisville",            location: "Louisville, Kentucky, USA" },
  ironman_melbourne:           { name: "IRONMAN Melbourne",             location: "Melbourne, Australia" },
  ironman_mont_tremblant:      { name: "IRONMAN Mont-Tremblant",        location: "Mont-Tremblant, Quebec, Canada" },
  ironman_new_york:            { name: "IRONMAN New York",              location: "New York, USA" },
  ironman_new_zealand:         { name: "IRONMAN New Zealand",           location: "Taupō, New Zealand" },
  ironman_regensburg:          { name: "IRONMAN Regensburg",            location: "Regensburg, Germany" },
  ironman_st_george:           { name: "IRONMAN St George",             location: "St George, Utah, USA" },
  ironman_uk:                  { name: "IRONMAN UK",                    location: "Bolton, UK" },
  ironman_western_australia:   { name: "IRONMAN Western Australia",     location: "Busselton, Western Australia" },
  ironman_los_cabos:           { name: "IRONMAN Los Cabos",             location: "Los Cabos, Mexico" },
  ironman_japan:               { name: "IRONMAN Japan",                 location: "北海道洞爺湖町・五島列島・南北海道" },
  ironman_lake_tahoe:          { name: "IRONMAN Lake Tahoe",            location: "Lake Tahoe, California, USA" },
  ironman_boulder:             { name: "IRONMAN Boulder",               location: "Boulder, Colorado, USA" },
  ironman_mallorca:            { name: "IRONMAN Mallorca",              location: "Alcúdia, Mallorca, Spain" },
  ironman_fortaleza:           { name: "IRONMAN Fortaleza",             location: "Fortaleza, Brazil" },
  ironman_maastricht_limburg:  { name: "IRONMAN Maastricht-Limburg",    location: "Maastricht, Netherlands" },
  ironman_vichy:               { name: "IRONMAN Vichy",                 location: "Vichy, France" },
  ironman_muskoka:             { name: "IRONMAN Muskoka",               location: "Huntsville, Ontario, Canada" },
  ironman_weymouth:            { name: "IRONMAN Weymouth",              location: "Weymouth, UK" },
  ironman_santa_rosa:          { name: "IRONMAN Santa Rosa",            location: "Santa Rosa, California, USA" },
  ironman_north_carolina:      { name: "IRONMAN North Carolina",        location: "Wilmington, North Carolina, USA" },
  ironman_argentina:           { name: "IRONMAN Argentina",             location: "Mar del Plata, Argentina" },
  ironman_philippines:         { name: "IRONMAN Philippines",           location: "Subic Bay, Philippines" },
  ironman_norway:              { name: "IRONMAN Norway",                location: "Haugesund, Norway" },
  ironman_ireland:             { name: "IRONMAN Ireland",               location: "Cork, Ireland" },
  ironman_tulsa:               { name: "IRONMAN Tulsa",                 location: "Tulsa, Oklahoma, USA" },
  ironman_china:               { name: "IRONMAN China",                 location: "Hainan, China" },
  ironman_kazakhstan:          { name: "IRONMAN Kazakhstan",            location: "Astana, Kazakhstan" },
  ironman_indiana:             { name: "IRONMAN Indiana",               location: "Muncie, Indiana, USA" },
  ironman_finland:             { name: "IRONMAN Finland",               location: "Lahti, Finland" },
  ironman_gdynia:              { name: "IRONMAN Gdynia",                location: "Gdynia, Poland" },
  ironman_world_championship_st_george: { name: "IRONMAN World Championship St George", location: "St George, Utah, USA" },
  ironman_des_moines:          { name: "IRONMAN Des Moines",            location: "Des Moines, Iowa, USA" },
  ironman_alaska:              { name: "IRONMAN Alaska",                location: "Juneau, Alaska, USA" },
  ironman_pays_aix:            { name: "IRONMAN Pays d'Aix-en-Provence", location: "Aix-en-Provence, France" },
  ironman_waco:                { name: "IRONMAN Waco",                  location: "Waco, Texas, USA" },
  ironman_israel:              { name: "IRONMAN Israel",                location: "Tiberias, Israel" },
  ironman_ottawa:              { name: "IRONMAN Ottawa",                location: "Ottawa, Ontario, Canada" },
  ironman_penghu:              { name: "IRONMAN Penghu",                location: "Penghu, Taiwan" },
  ironman_vietnam:             { name: "IRONMAN Vietnam",               location: "Da Nang, Vietnam" },
  ironman_jacksonville:        { name: "IRONMAN Jacksonville",          location: "Jacksonville, Florida, USA" },
  ironman_tours_metropole:     { name: "IRONMAN Tours Métropole",       location: "Tours, France" },
};

function buildEdition(eventId, year, raceDate) {
  return {
    date: raceDate,
    categories: [
      {
        id: `${eventId}_${year}`,
        result_tsv: `master/${year}/${eventId}_${year}/default.tsv`,
        name: "Full Distance",
        distance: "LD",
        description: `${year} ${(NEW_EVENT_META[eventId]?.name) || `IRONMAN ${eventId.replace(/^ironman_/, "").replace(/_/g, " ")}`}`,
        segments: [
          { sport: "swim", distance: 3.8,    columns: [{ header: "Swim", role: "lap" }] },
          { sport: "bike", distance: 180.2,  columns: [{ header: "Bike", role: "lap" }] },
          { sport: "run",  distance: 42.195, columns: [{ header: "Run",  role: "lap" }] },
        ],
        meta_columns: [
          { header: "ContactId",    role: "athlete_id" },
          { header: "Overall_Rank", role: "overall_rank" },
          { header: "Name",         role: "name" },
          { header: "Gender",       role: "gender" },
          { header: "Division",     role: "age_category" },
          { header: "Div_Rank",     role: "age_rank" },
          { header: "Total_Time",   role: "total_time" },
          { header: "Country",      role: "residence" },
          { header: "Status",       role: "status" },
        ],
      },
    ],
  };
}

function epochToISODate(epoch, year) {
  if (!epoch) return year ? `${year}-01-01` : null;
  const d = new Date(Number(epoch) * 1000);
  return d.toISOString().slice(0, 10);
}

function buildNewEvent(eventId, sid, races) {
  const meta = NEW_EVENT_META[eventId];
  if (!meta) throw new Error(`No metadata for ${eventId}`);
  const sortedEditions = [...races]
    .filter((r) => importedSet.has(`${eventId}:${r.year}`))
    .sort((a, b) => Number(b.year) - Number(a.year))
    .map((r) => buildEdition(eventId, r.year, epochToISODate(r.date, r.year)));
  return {
    id: eventId,
    name: meta.name,
    location: meta.location,
    image: `images/${eventId}.webp`,
    source: `https://www.coachcox.co.uk/imstats/series/${sid}/`,
    editions: sortedEditions,
  };
}

const data = JSON.parse(readFileSync(raceInfoPath, "utf-8"));

// Anchor for inserting new events: insert all new events after ironman_canada
let canadaIdx = data.events.findIndex((e) => e.id === "ironman_canada");
if (canadaIdx < 0) throw new Error("ironman_canada anchor not found");

let added = 0;
let filledEditions = 0;

// 1) Add new events
for (const newEv of plan.newEvents) {
  // Skip if already exists (idempotent re-run)
  if (data.events.some((e) => e.id === newEv.eventId)) continue;
  const event = buildNewEvent(newEv.eventId, newEv.sid, newEv.races);
  if (event.editions.length === 0) continue; // skip events where all races were empty
  data.events.splice(canadaIdx + 1, 0, event);
  canadaIdx++; // keep insertion ordering stable
  added++;
}

// 2) Add missing-year editions to existing events
for (const ev of plan.missingYears) {
  const target = data.events.find((e) => e.id === ev.eventId);
  if (!target) {
    console.warn(`Existing event ${ev.eventId} not found, skipping fills`);
    continue;
  }
  const existingDates = new Set(target.editions.map((e) => e.date.slice(0, 4)));
  const newOnes = ev.missing
    .filter((r) => importedSet.has(`${ev.eventId}:${r.year}`))
    .filter((r) => !existingDates.has(String(r.year)))
    .map((r) => buildEdition(ev.eventId, r.year, epochToISODate(r.date, r.year)));
  if (newOnes.length === 0) continue;
  target.editions.push(...newOnes);
  // Sort editions by date desc
  target.editions.sort((a, b) => b.date.localeCompare(a.date));
  filledEditions += newOnes.length;
}

writeFileSync(raceInfoPath, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Added ${added} new events, filled ${filledEditions} missing editions`);
console.log(`Wrote ${raceInfoPath}`);
