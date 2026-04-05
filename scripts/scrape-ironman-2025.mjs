/**
 * Scrape all 2025 Ironman & 70.3 race results from CoachCox
 * Usage: node scripts/scrape-ironman-2025.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

// All 2025 Ironman races with CoachCox IDs
const RACES = [
  // Full Distance
  { id: "ironman_south_africa_2025",    name: "IRONMAN South Africa",          date: "2025-03-30", coachcox: 2197, dist: "LD",  location: "Port Elizabeth, South Africa" },
  { id: "ironman_taiwan_2025",          name: "IRONMAN Taiwan",                date: "2025-04-13", coachcox: 2201, dist: "LD",  location: "Taiwan" },
  { id: "ironman_texas_2025",           name: "IRONMAN Texas",                 date: "2025-04-26", coachcox: 2199, dist: "LD",  location: "The Woodlands, Texas, USA" },
  { id: "ironman_australia_2025",       name: "IRONMAN Australia",             date: "2025-05-04", coachcox: 2187, dist: "LD",  location: "Port Macquarie, Australia" },
  { id: "ironman_austria_2025",         name: "IRONMAN Austria",               date: "2025-06-15", coachcox: 2193, dist: "LD",  location: "Klagenfurt, Austria" },
  { id: "ironman_lanzarote_2025",       name: "IRONMAN Lanzarote",             date: "2025-05-17", coachcox: 2195, dist: "LD",  location: "Lanzarote, Spain" },
  { id: "ironman_brazil_2025",          name: "IRONMAN Brazil",                date: "2025-06-01", coachcox: 2188, dist: "LD",  location: "Florianopolis, Brazil" },
  { id: "ironman_cairns_2025",          name: "IRONMAN Cairns",                date: "2025-06-15", coachcox: 2189, dist: "LD",  location: "Cairns, Australia" },
  { id: "ironman_frankfurt_2025",       name: "IRONMAN Frankfurt",             date: "2025-06-29", coachcox: 2205, dist: "LD",  location: "Frankfurt, Germany" },
  { id: "ironman_france_2025",          name: "IRONMAN France",                date: "2025-06-29", coachcox: 2191, dist: "LD",  location: "Nice, France" },
  { id: "ironman_hamburg_2025",         name: "IRONMAN Hamburg",               date: "2025-06-01", coachcox: 2192, dist: "LD",  location: "Hamburg, Germany" },
  { id: "ironman_les_sables_2025",      name: "IRONMAN Les Sables d'Olonne",   date: "2025-06-22", coachcox: 2196, dist: "LD",  location: "Les Sables d'Olonne, France" },
  { id: "ironman_vitoria_2025",         name: "IRONMAN Vitoria-Gasteiz",       date: "2025-07-13", coachcox: 2200, dist: "LD",  location: "Vitoria-Gasteiz, Spain" },
  { id: "ironman_leeds_2025",           name: "IRONMAN Leeds",                 date: "2025-07-27", coachcox: 2206, dist: "LD",  location: "Leeds, UK" },
  { id: "ironman_sweden_2025",          name: "IRONMAN Sweden",                date: "2025-08-16", coachcox: 2208, dist: "LD",  location: "Kalmar, Sweden" },
  { id: "ironman_copenhagen_2025",      name: "IRONMAN Copenhagen",            date: "2025-08-17", coachcox: 2209, dist: "LD",  location: "Copenhagen, Denmark" },
  { id: "ironman_tallinn_2025",         name: "IRONMAN Tallinn",               date: "2025-08-23", coachcox: 2452, dist: "LD",  location: "Tallinn, Estonia" },
  { id: "ironman_switzerland_2025",     name: "IRONMAN Switzerland",           date: "2025-08-24", coachcox: 2453, dist: "LD",  location: "Thun, Switzerland" },
  { id: "ironman_wisconsin_2025",       name: "IRONMAN Wisconsin",             date: "2025-09-07", coachcox: 2454, dist: "LD",  location: "Madison, Wisconsin, USA" },
  { id: "ironman_south_hokkaido_2025",  name: "IRONMAN Japan South Hokkaido",  date: "2025-09-14", coachcox: 2455, dist: "LD",  location: "北海道木古内町・北斗市" },
  { id: "ironman_italy_2025",           name: "IRONMAN Italy",                 date: "2025-09-20", coachcox: 2456, dist: "LD",  location: "Cervia, Italy" },
  { id: "ironman_maryland_2025",        name: "IRONMAN Maryland",              date: "2025-09-20", coachcox: 2457, dist: "LD",  location: "Cambridge, Maryland, USA" },
  { id: "ironman_wales_2025",           name: "IRONMAN Wales",                 date: "2025-09-21", coachcox: 2458, dist: "LD",  location: "Tenby, Wales, UK" },
  { id: "ironman_chattanooga_2025",     name: "IRONMAN Chattanooga",           date: "2025-09-28", coachcox: 2459, dist: "LD",  location: "Chattanooga, Tennessee, USA" },
  { id: "ironman_gurye_2025",           name: "IRONMAN Gurye",                 date: "2025-09-28", coachcox: 2460, dist: "LD",  location: "Gurye, South Korea" },
  { id: "ironman_barcelona_2025",       name: "IRONMAN Barcelona",             date: "2025-10-05", coachcox: 2461, dist: "LD",  location: "Calella, Barcelona, Spain" },
  { id: "ironman_malaysia_2025",        name: "IRONMAN Malaysia",              date: "2025-11-01", coachcox: 2462, dist: "LD",  location: "Langkawi, Malaysia" },
  { id: "ironman_portugal_2025",        name: "IRONMAN Portugal - Cascais",    date: "2025-10-18", coachcox: 2463, dist: "LD",  location: "Cascais, Portugal" },
  { id: "ironman_california_2025",      name: "IRONMAN California",            date: "2025-10-19", coachcox: 2464, dist: "LD",  location: "Sacramento, California, USA" },
  { id: "ironman_florida_2025",         name: "IRONMAN Florida",               date: "2025-11-01", coachcox: 2465, dist: "LD",  location: "Panama City Beach, Florida, USA" },
  { id: "ironman_arizona_2025",         name: "IRONMAN Arizona",               date: "2025-11-16", coachcox: 2466, dist: "LD",  location: "Tempe, Arizona, USA" },
  // 70.3
  { id: "im703_oman_2025",             name: "IRONMAN 70.3 Oman",             date: "2025-02-08", coachcox: 2401, dist: "MD",  location: "Muscat, Oman" },
  { id: "im703_puerto_princesa_2025",  name: "IRONMAN 70.3 Puerto Princesa",  date: "2025-03-02", coachcox: 2404, dist: "MD",  location: "Puerto Princesa, Philippines" },
  { id: "im703_mallorca_2025",         name: "IRONMAN 70.3 Mallorca",         date: "2025-05-10", coachcox: 2392, dist: "MD",  location: "Alcudia, Mallorca, Spain" },
  { id: "im703_valencia_2025",         name: "IRONMAN 70.3 Valencia",         date: "2025-04-27", coachcox: 2414, dist: "MD",  location: "Valencia, Spain" },
  { id: "im703_venice_2025",           name: "IRONMAN 70.3 Venice-Jesolo",    date: "2025-05-04", coachcox: 2418, dist: "MD",  location: "Jesolo, Italy" },
  { id: "im703_port_macquarie_2025",   name: "IRONMAN 70.3 Port Macquarie",   date: "2025-05-04", coachcox: 2417, dist: "MD",  location: "Port Macquarie, Australia" },
  { id: "im703_gulf_coast_2025",       name: "IRONMAN 70.3 Gulf Coast",       date: "2025-05-10", coachcox: 2419, dist: "MD",  location: "Panama City Beach, Florida, USA" },
  { id: "im703_st_george_2025",        name: "IRONMAN 70.3 St George",        date: "2025-05-10", coachcox: 2420, dist: "MD",  location: "St George, Utah, USA" },
  { id: "im703_hawaii_2025",           name: "IRONMAN 70.3 Hawaii",           date: "2025-05-31", coachcox: 2428, dist: "MD",  location: "Hilo, Hawaii, USA" },
  { id: "im703_desaru_2025",           name: "IRONMAN 70.3 Desaru Coast",     date: "2025-05-25", coachcox: 2424, dist: "MD",  location: "Desaru Coast, Malaysia" },
  { id: "im703_shanghai_2025",         name: "IRONMAN 70.3 Shanghai",         date: "2025-05-25", coachcox: 2426, dist: "MD",  location: "Shanghai, China" },
  { id: "im703_kraichgau_2025",        name: "IRONMAN 70.3 Kraichgau",        date: "2025-05-25", coachcox: 2425, dist: "MD",  location: "Kraichgau, Germany" },
  { id: "im703_aix_2025",              name: "IRONMAN 70.3 Aix-en-Provence",  date: "2025-05-18", coachcox: 2422, dist: "MD",  location: "Aix-en-Provence, France" },
  { id: "im703_chattanooga_2025",      name: "IRONMAN 70.3 Chattanooga",      date: "2025-05-18", coachcox: 2423, dist: "MD",  location: "Chattanooga, Tennessee, USA" },
  { id: "im703_tours_2025",            name: "IRONMAN 70.3 Tours",            date: "2025-06-01", coachcox: 2431, dist: "MD",  location: "Tours, France" },
  { id: "im703_switzerland_2025",      name: "IRONMAN 70.3 Switzerland",      date: "2025-06-01", coachcox: 2430, dist: "MD",  location: "Rapperswil-Jona, Switzerland" },
  { id: "im703_cairns_2025",           name: "IRONMAN 70.3 Cairns",           date: "2025-06-15", coachcox: 2437, dist: "MD",  location: "Cairns, Australia" },
  { id: "im703_goseong_2025",          name: "IRONMAN 70.3 Goseong Korea",    date: "2025-06-15", coachcox: 2438, dist: "MD",  location: "Goseong, South Korea" },
  { id: "im703_subic_2025",            name: "IRONMAN 70.3 Subic Bay",        date: "2025-06-15", coachcox: 2441, dist: "MD",  location: "Subic Bay, Philippines" },
  { id: "im703_warsaw_2025",           name: "IRONMAN 70.3 Warsaw",           date: "2025-06-08", coachcox: 2394, dist: "MD",  location: "Warsaw, Poland" },
  { id: "im703_des_moines_2025",       name: "IRONMAN 70.3 Des Moines",       date: "2025-06-08", coachcox: 2433, dist: "MD",  location: "Des Moines, Iowa, USA" },
  { id: "im703_eagleman_2025",         name: "IRONMAN 70.3 Eagleman",         date: "2025-06-08", coachcox: 2434, dist: "MD",  location: "Cambridge, Maryland, USA" },
  { id: "im703_western_mass_2025",     name: "IRONMAN 70.3 Western Massachusetts", date: "2025-06-08", coachcox: 2435, dist: "MD", location: "Franklin, Massachusetts, USA" },
  { id: "im703_bolton_2025",           name: "IRONMAN 70.3 Bolton",           date: "2025-06-08", coachcox: 2432, dist: "MD",  location: "Bolton, UK" },
  { id: "im703_happy_valley_2025",     name: "IRONMAN 70.3 Pennsylvania Happy Valley", date: "2025-06-15", coachcox: 2439, dist: "MD", location: "State College, Pennsylvania, USA" },
  { id: "im703_elsinore_2025",         name: "IRONMAN 70.3 Elsinore",         date: "2025-06-22", coachcox: 2442, dist: "MD",  location: "Elsinore, Denmark" },
  { id: "im703_boulder_2025",          name: "IRONMAN 70.3 Boulder",          date: "2025-06-14", coachcox: 2436, dist: "MD",  location: "Boulder, Colorado, USA" },
  { id: "im703_coeur_dalene_2025",     name: "IRONMAN 70.3 Coeur d'Alene",    date: "2025-06-22", coachcox: 2447, dist: "MD",  location: "Coeur d'Alene, Idaho, USA" },
  { id: "im703_mont_tremblant_2025",   name: "IRONMAN 70.3 Mont Tremblant",   date: "2025-06-22", coachcox: 2443, dist: "MD",  location: "Mont Tremblant, Quebec, Canada" },
  { id: "im703_rockford_2025",         name: "IRONMAN 70.3 Rockford",         date: "2025-06-22", coachcox: 2444, dist: "MD",  location: "Rockford, Illinois, USA" },
  { id: "im703_westfriesland_2025",    name: "IRONMAN 70.3 Westfriesland",    date: "2025-06-22", coachcox: 2445, dist: "MD",  location: "Westfriesland, Netherlands" },
  { id: "im703_nice_2025",             name: "IRONMAN 70.3 Nice",             date: "2025-06-29", coachcox: 2446, dist: "MD",  location: "Nice, France" },
  { id: "im703_muskoka_2025",          name: "IRONMAN 70.3 Muskoka",          date: "2025-07-06", coachcox: 2623, dist: "MD",  location: "Huntsville, Ontario, Canada" },
  { id: "im703_jonkoping_2025",        name: "IRONMAN 70.3 Jönköping",        date: "2025-07-06", coachcox: 2610, dist: "MD",  location: "Jönköping, Sweden" },
  { id: "im703_luxembourg_2025",       name: "IRONMAN 70.3 Luxembourg",       date: "2025-07-13", coachcox: 2617, dist: "MD",  location: "Luxembourg" },
  { id: "im703_muncie_2025",           name: "IRONMAN 70.3 Muncie",           date: "2025-07-12", coachcox: 2622, dist: "MD",  location: "Muncie, Indiana, USA" },
  { id: "im703_musselman_2025",        name: "IRONMAN 70.3 Musselman",        date: "2025-07-13", coachcox: 2624, dist: "MD",  location: "Geneva, New York, USA" },
  { id: "im703_swansea_2025",          name: "IRONMAN 70.3 Swansea",          date: "2025-07-13", coachcox: 2639, dist: "MD",  location: "Swansea, Wales, UK" },
  { id: "im703_boise_2025",            name: "IRONMAN 70.3 Boise",            date: "2025-07-26", coachcox: 2594, dist: "MD",  location: "Boise, Idaho, USA" },
  { id: "im703_ohio_2025",             name: "IRONMAN 70.3 Ohio",             date: "2025-07-20", coachcox: 2627, dist: "MD",  location: "Delaware, Ohio, USA" },
  { id: "im703_oregon_2025",           name: "IRONMAN 70.3 Oregon",           date: "2025-07-20", coachcox: 2628, dist: "MD",  location: "Portland, Oregon, USA" },
  { id: "im703_calgary_2025",          name: "IRONMAN 70.3 Calgary",          date: "2025-07-27", coachcox: 2734, dist: "MD",  location: "Calgary, Alberta, Canada" },
  { id: "im703_maine_2025",            name: "IRONMAN 70.3 Maine",            date: "2025-07-27", coachcox: 2618, dist: "MD",  location: "Old Orchard Beach, Maine, USA" },
  { id: "im703_lapu_lapu_2025",        name: "IRONMAN 70.3 Lapu-Lapu",        date: "2025-08-10", coachcox: 2599, dist: "MD",  location: "Lapu-Lapu City, Philippines" },
  { id: "im703_krakow_2025",           name: "IRONMAN 70.3 Krakow",           date: "2025-08-03", coachcox: 2613, dist: "MD",  location: "Krakow, Poland" },
  { id: "im703_hradec_2025",           name: "IRONMAN 70.3 Hradec Králové",   date: "2025-08-17", coachcox: 2609, dist: "MD",  location: "Hradec Králové, Czech Republic" },
  { id: "im703_louisville_2025",       name: "IRONMAN 70.3 Louisville",       date: "2025-08-17", coachcox: 2616, dist: "MD",  location: "Louisville, Kentucky, USA" },
  { id: "im703_vichy_2025",            name: "IRONMAN 70.3 Vichy",            date: "2025-08-24", coachcox: 2643, dist: "MD",  location: "Vichy, France" },
  { id: "im703_tallinn_2025",          name: "IRONMAN 70.3 Tallinn",          date: "2025-08-24", coachcox: 2640, dist: "MD",  location: "Tallinn, Estonia" },
  { id: "im703_zell_am_see_2025",      name: "IRONMAN 70.3 Zell am See-Kaprun", date: "2025-08-31", coachcox: 2650, dist: "MD", location: "Zell am See, Austria" },
  { id: "im703_duisburg_2025",         name: "IRONMAN 70.3 Duisburg",         date: "2025-09-07", coachcox: 2600, dist: "MD",  location: "Duisburg, Germany" },
  { id: "im703_knokke_2025",           name: "IRONMAN 70.3 Knokke-Heist",     date: "2025-09-07", coachcox: 2612, dist: "MD",  location: "Knokke-Heist, Belgium" },
  { id: "im703_poznan_2025",           name: "IRONMAN 70.3 Poznan",           date: "2025-09-07", coachcox: 2632, dist: "MD",  location: "Poznan, Poland" },
  { id: "im703_santa_cruz_2025",       name: "IRONMAN 70.3 Santa Cruz",       date: "2025-09-07", coachcox: 2636, dist: "MD",  location: "Santa Cruz, California, USA" },
  { id: "im703_wisconsin_2025",        name: "IRONMAN 70.3 Wisconsin",        date: "2025-09-06", coachcox: 2649, dist: "MD",  location: "Madison, Wisconsin, USA" },
  { id: "im703_erkner_2025",           name: "IRONMAN 70.3 Erkner Berlin-Brandenburg", date: "2025-09-14", coachcox: 2604, dist: "MD", location: "Erkner, Germany" },
  { id: "im703_michigan_2025",         name: "IRONMAN 70.3 Michigan",         date: "2025-09-14", coachcox: 2620, dist: "MD",  location: "Traverse City, Michigan, USA" },
  { id: "im703_weymouth_2025",         name: "IRONMAN 70.3 Weymouth",         date: "2025-09-14", coachcox: 2648, dist: "MD",  location: "Weymouth, UK" },
  { id: "im703_new_york_2025",         name: "IRONMAN 70.3 New York",         date: "2025-09-20", coachcox: 2625, dist: "MD",  location: "New York, USA" },
  { id: "im703_emilia_romagna_2025",   name: "IRONMAN 70.3 Italy Emilia-Romagna", date: "2025-09-21", coachcox: 2602, dist: "MD", location: "Cervia, Italy" },
  { id: "im703_belgrade_2025",         name: "IRONMAN 70.3 Belgrade",         date: "2025-09-21", coachcox: 2651, dist: "MD",  location: "Belgrade, Serbia" },
  { id: "im703_cozumel_2025",          name: "IRONMAN 70.3 Cozumel",          date: "2025-09-21", coachcox: 2598, dist: "MD",  location: "Cozumel, Mexico" },
  { id: "im703_washington_2025",       name: "IRONMAN 70.3 Washington Tri-Cities", date: "2025-09-21", coachcox: 2645, dist: "MD", location: "Kennewick, Washington, USA" },
  { id: "im703_augusta_2025",          name: "IRONMAN 70.3 Augusta",          date: "2025-09-28", coachcox: 2593, dist: "MD",  location: "Augusta, Georgia, USA" },
  { id: "im703_waco_2025",             name: "IRONMAN 70.3 Waco",             date: "2025-10-05", coachcox: 2644, dist: "MD",  location: "Waco, Texas, USA" },
  { id: "im703_portugal_2025",         name: "IRONMAN 70.3 Portugal - Cascais", date: "2025-10-18", coachcox: 2631, dist: "MD", location: "Cascais, Portugal" },
  { id: "im703_porec_2025",            name: "IRONMAN 70.3 Porec",            date: "2025-10-19", coachcox: 2630, dist: "MD",  location: "Porec, Croatia" },
  { id: "im703_marathon_2025",         name: "IRONMAN 70.3 Marathon",         date: "2025-10-26", coachcox: 2608, dist: "MD",  location: "Marathon, Greece" },
  { id: "im703_salalah_2025",          name: "IRONMAN 70.3 Salalah",          date: "2025-10-25", coachcox: 2635, dist: "MD",  location: "Salalah, Oman" },
  { id: "im703_north_carolina_2025",   name: "IRONMAN 70.3 North Carolina",   date: "2025-10-25", coachcox: 2626, dist: "MD",  location: "Wilmington, North Carolina, USA" },
  { id: "im703_turkey_2025",           name: "IRONMAN 70.3 Turkey",           date: "2025-11-02", coachcox: 2641, dist: "MD",  location: "Antalya, Turkey" },
  { id: "im703_langkawi_2025",         name: "IRONMAN 70.3 Langkawi",         date: "2025-11-01", coachcox: 2615, dist: "MD",  location: "Langkawi, Malaysia" },
  { id: "im703_kenting_2025",          name: "IRONMAN 70.3 Kenting",          date: "2025-11-02", coachcox: 2611, dist: "MD",  location: "Kenting, Taiwan" },
  { id: "im703_melbourne_2025",        name: "IRONMAN 70.3 Melbourne",        date: "2025-11-09", coachcox: 2619, dist: "MD",  location: "Melbourne, Australia" },
  { id: "im703_goa_2025",              name: "IRONMAN 70.3 Goa",              date: "2025-11-09", coachcox: 2607, dist: "MD",  location: "Goa, India" },
  { id: "im703_phu_quoc_2025",         name: "IRONMAN 70.3 Phu Quoc",         date: "2025-11-16", coachcox: 2629, dist: "MD",  location: "Phu Quoc, Vietnam" },
  { id: "im703_indian_wells_2025",     name: "IRONMAN 70.3 Indian Wells La Quinta", date: "2025-12-07", coachcox: 2614, dist: "MD", location: "La Quinta, California, USA" },
  { id: "im703_florida_2025",          name: "IRONMAN 70.3 Florida",          date: "2025-12-14", coachcox: 2606, dist: "MD",  location: "Haines City, Florida, USA" },
  { id: "im703_wc_women_2025",         name: "IRONMAN 70.3 World Championship (Women)", date: "2025-11-08", coachcox: 2661, dist: "MD", location: "Marbella, Spain" },
  { id: "im703_wc_men_2025",           name: "IRONMAN 70.3 World Championship (Men)", date: "2025-11-09", coachcox: 2662, dist: "MD", location: "Marbella, Spain" },
];

function normalizeTime(t) {
  if (!t || t.trim() === "") return t;
  const parts = t.trim().split(":");
  if (parts.length === 2) return `0:${t.trim()}`;
  return t.trim();
}

function extractAthletes(bodyText) {
  // Find the data block between headers and double newline
  const headerEnd = bodyText.indexOf("Run Time\n\n");
  if (headerEnd < 0) return [];
  const dataStart = headerEnd + "Run Time\n\n".length;
  let dataEnd = bodyText.indexOf("\n\n", dataStart);
  if (dataEnd < 0) dataEnd = bodyText.length;
  const dataStr = bodyText.slice(dataStart, dataEnd);
  const lines = dataStr.split("\n").filter((l) => l.trim());
  const athletes = [];
  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length !== 11) continue;
    const [name, gender, division, divRank, totalTime, overallRank, , , swim, bike, run] = parts;
    const g = gender === "Male" ? "M" : gender === "Female" ? "F" : gender;
    athletes.push({
      rank: overallRank,
      name,
      gender: g,
      division,
      div_rank: divRank,
      total_time: normalizeTime(totalTime),
      swim: normalizeTime(swim),
      bike: normalizeTime(bike),
      run: normalizeTime(run),
    });
  }
  return athletes;
}

async function scrapeRace(browser, race) {
  const url = `https://www.coachcox.co.uk/imstats/race/${race.coachcox}/results/`;
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    // Wait for results to load
    await page.waitForTimeout(2000);
    const bodyText = await page.evaluate(() => document.body.innerText);

    if (!bodyText.includes("Run Time")) {
      return { race, athletes: [], status: "no_data" };
    }

    const athletes = extractAthletes(bodyText);
    return { race, athletes, status: "ok" };
  } catch (err) {
    return { race, athletes: [], status: `error: ${err.message}` };
  } finally {
    await page.close();
  }
}

function saveTsv(race, athletes) {
  const year = race.date.slice(0, 4);
  const dir = join(repoRoot, "master", year, race.id);
  mkdirSync(dir, { recursive: true });
  const tsv = ["Overall_Rank\tName\tGender\tDivision\tDiv_Rank\tTotal_Time\tSwim\tBike\tRun"];
  for (const a of athletes) {
    tsv.push(`${a.rank}\t${a.name}\t${a.gender}\t${a.division}\t${a.div_rank}\t${a.total_time}\t${a.swim}\t${a.bike}\t${a.run}`);
  }
  writeFileSync(join(dir, "default.tsv"), tsv.join("\n") + "\n");
}

async function main() {
  console.log(`Scraping ${RACES.length} races...`);
  const browser = await chromium.launch({ headless: true });

  const results = [];
  const CONCURRENCY = 5;

  for (let i = 0; i < RACES.length; i += CONCURRENCY) {
    const batch = RACES.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map((r) => scrapeRace(browser, r)));
    for (const res of batchResults) {
      results.push(res);
      const icon = res.status === "ok" ? "✅" : "⚠️";
      console.log(`${icon} [${res.race.coachcox}] ${res.race.name}: ${res.athletes.length} athletes (${res.status})`);
      if (res.athletes.length > 0) {
        saveTsv(res.race, res.athletes);
      }
    }
  }

  await browser.close();

  const ok = results.filter((r) => r.athletes.length > 0);
  const empty = results.filter((r) => r.athletes.length === 0);
  console.log(`\nDone: ${ok.length} races with data, ${empty.length} empty/error`);
  if (empty.length > 0) {
    console.log("Empty:", empty.map((r) => r.race.name).join(", "));
  }

  // Save summary JSON for race-info.json generation
  writeFileSync(
    join(repoRoot, "scripts", "ironman-2025-scrape-results.json"),
    JSON.stringify(results.map((r) => ({ ...r.race, athlete_count: r.athletes.length, status: r.status })), null, 2),
  );
  console.log("Summary saved to scripts/ironman-2025-scrape-results.json");
}

main().catch(console.error);
