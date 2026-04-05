/**
 * Fetch images for all 2025 Ironman races from Wikimedia Commons
 * Uses location keywords to find suitable images
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const imagesDir = join(repoRoot, "images");

// Race ID -> Wikimedia search keywords
const IMAGE_SEARCHES = {
  // Full Distance
  ironman_south_africa_2025:   "Port Elizabeth South Africa sea",
  ironman_taiwan_2025:         "Taiwan coast scenic",
  ironman_texas_2025:          "The Woodlands Texas waterway",
  ironman_australia_2025:      "Port Macquarie Australia beach",
  ironman_austria_2025:        "Klagenfurt Wörthersee Austria",
  ironman_lanzarote_2025:      "Lanzarote volcanic landscape",
  ironman_brazil_2025:         "Florianopolis Brazil beach",
  ironman_cairns_2025:         "Cairns Australia Great Barrier Reef",
  ironman_frankfurt_2025:      "Frankfurt am Main skyline",
  ironman_france_2025:         "Nice France Promenade des Anglais",
  ironman_hamburg_2025:        "Hamburg Alster lake",
  ironman_les_sables_2025:     "Les Sables Olonne France beach",
  ironman_vitoria_2025:        "Vitoria-Gasteiz Spain",
  ironman_leeds_2025:          "Leeds city river",
  ironman_sweden_2025:         "Kalmar Sweden sea",
  ironman_copenhagen_2025:     "Copenhagen Denmark harbor",
  ironman_tallinn_2025:        "Tallinn Estonia old town",
  ironman_switzerland_2025:    "Thun Switzerland lake Alps",
  ironman_wisconsin_2025:      "Madison Wisconsin Capitol lake",
  ironman_italy_2025:          "Cervia Italy Adriatic coast",
  ironman_maryland_2025:       "Cambridge Maryland Chesapeake Bay",
  ironman_wales_2025:          "Tenby Wales harbour",
  ironman_chattanooga_2025:    "Chattanooga Tennessee river bridge",
  ironman_gurye_2025:          "Gurye South Korea river",
  ironman_barcelona_2025:      "Calella Barcelona coast",
  ironman_malaysia_2025:       "Langkawi Malaysia beach",
  ironman_portugal_2025:       "Cascais Portugal coast",
  ironman_california_2025:     "Sacramento California river",
  ironman_florida_2025:        "Panama City Beach Florida",
  ironman_arizona_2025:        "Tempe Arizona Town Lake",
  // 70.3
  im703_oman_2025:             "Muscat Oman coast",
  im703_puerto_princesa_2025:  "Puerto Princesa Philippines bay",
  im703_mallorca_2025:         "Alcudia Mallorca Spain bay",
  im703_valencia_2025:         "Valencia Spain coast",
  im703_venice_2025:           "Jesolo Italy beach Adriatic",
  im703_port_macquarie_2025:   "Port Macquarie Australia lighthouse",
  im703_gulf_coast_2025:       "Panama City Beach Gulf Coast Florida",
  im703_st_george_2025:        "St George Utah red rock",
  im703_hawaii_2025:           "Hilo Hawaii Big Island",
  im703_desaru_2025:           "Desaru Coast Malaysia beach",
  im703_shanghai_2025:         "Shanghai Bund skyline",
  im703_kraichgau_2025:        "Kraichgau Germany countryside",
  im703_aix_2025:              "Aix-en-Provence France",
  im703_chattanooga_2025:      "Chattanooga Tennessee mountain",
  im703_tours_2025:            "Tours Loire Valley France",
  im703_switzerland_2025:      "Rapperswil-Jona Switzerland lake",
  im703_cairns_2025:           "Cairns Queensland tropical",
  im703_goseong_2025:          "Goseong South Korea coast",
  im703_subic_2025:            "Subic Bay Philippines",
  im703_warsaw_2025:           "Warsaw Poland Vistula",
  im703_des_moines_2025:       "Des Moines Iowa river",
  im703_eagleman_2025:         "Cambridge Maryland river",
  im703_western_mass_2025:     "Franklin Massachusetts",
  im703_bolton_2025:           "Bolton UK moor",
  im703_happy_valley_2025:     "State College Pennsylvania",
  im703_elsinore_2025:         "Elsinore Denmark lake",
  im703_boulder_2025:          "Boulder Colorado Flatirons",
  im703_coeur_dalene_2025:     "Coeur d'Alene Idaho lake",
  im703_mont_tremblant_2025:   "Mont Tremblant Quebec lake",
  im703_rockford_2025:         "Rockford Illinois river",
  im703_westfriesland_2025:    "Westfriesland Netherlands polder",
  im703_nice_2025:             "Nice France bay",
  im703_muskoka_2025:          "Muskoka Ontario lake",
  im703_jonkoping_2025:        "Jönköping Sweden lake Vättern",
  im703_luxembourg_2025:       "Luxembourg city",
  im703_muncie_2025:           "Muncie Indiana",
  im703_musselman_2025:        "Seneca Lake New York",
  im703_swansea_2025:          "Swansea Wales bay",
  im703_boise_2025:            "Boise Idaho river",
  im703_ohio_2025:             "Delaware Ohio reservoir",
  im703_oregon_2025:           "Portland Oregon river bridge",
  im703_calgary_2025:          "Calgary Alberta Bow River",
  im703_maine_2025:            "Old Orchard Beach Maine",
  im703_lapu_lapu_2025:        "Lapu-Lapu City Mactan Philippines",
  im703_krakow_2025:           "Krakow Poland Vistula",
  im703_hradec_2025:           "Hradec Králové Czech Republic",
  im703_louisville_2025:       "Louisville Kentucky Ohio River",
  im703_vichy_2025:            "Vichy France Allier",
  im703_tallinn_2025:          "Tallinn Estonia bay",
  im703_zell_am_see_2025:      "Zell am See Austria Alps lake",
  im703_duisburg_2025:         "Duisburg Germany Rhine",
  im703_knokke_2025:           "Knokke-Heist Belgium sea",
  im703_poznan_2025:           "Poznan Poland lake Maltańskie",
  im703_santa_cruz_2025:       "Santa Cruz California coast",
  im703_wisconsin_2025:        "Madison Wisconsin lake Mendota",
  im703_erkner_2025:           "Erkner Brandenburg lake",
  im703_michigan_2025:         "Traverse City Michigan bay",
  im703_weymouth_2025:         "Weymouth Dorset England coast",
  im703_new_york_2025:         "New York Hudson River",
  im703_emilia_romagna_2025:   "Cervia Italy Adriatic",
  im703_belgrade_2025:         "Belgrade Serbia Danube",
  im703_cozumel_2025:          "Cozumel Mexico Caribbean",
  im703_washington_2025:       "Kennewick Washington Columbia River",
  im703_augusta_2025:          "Augusta Georgia Savannah River",
  im703_waco_2025:             "Waco Texas Brazos River",
  im703_portugal_2025:         "Cascais Portugal lighthouse",
  im703_porec_2025:            "Porec Croatia Adriatic",
  im703_marathon_2025:         "Marathon Greece sea",
  im703_salalah_2025:          "Salalah Oman coast",
  im703_north_carolina_2025:   "Wilmington North Carolina coast",
  im703_turkey_2025:           "Antalya Turkey Mediterranean",
  im703_langkawi_2025:         "Langkawi Malaysia island",
  im703_kenting_2025:          "Kenting Taiwan coast",
  im703_melbourne_2025:        "Melbourne Australia bay",
  im703_goa_2025:              "Goa India beach",
  im703_phu_quoc_2025:         "Phu Quoc Vietnam beach",
  im703_indian_wells_2025:     "La Quinta California desert mountains",
  im703_florida_2025:          "Haines City Florida lake",
  im703_wc_women_2025:         "Marbella Spain coast",
  im703_wc_men_2025:           "Marbella Spain Mediterranean",
};

async function searchWikimedia(query) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srnamespace=6&srlimit=5&format=json`;
  const res = await fetch(url);
  const data = await res.json();
  const hits = data?.query?.search || [];
  if (hits.length === 0) return null;
  // Take first result
  const title = hits[0].title.replace("File:", "");
  return title;
}

async function getDirectUrl(filename) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(filename)}&prop=imageinfo&iiprop=url&format=json`;
  const res = await fetch(url);
  const data = await res.json();
  const pages = Object.values(data?.query?.pages || {});
  if (!pages[0]?.imageinfo?.[0]?.url) return null;
  return pages[0].imageinfo[0].url;
}

function downloadAndConvert(srcUrl, destPath) {
  const tmpFile = `/tmp/ironman_img_${Date.now()}.jpg`;
  try {
    execSync(`curl -s -L --max-time 30 -o "${tmpFile}" "${srcUrl}"`, { stdio: "pipe" });
    execSync(`magick "${tmpFile}" -resize 300x200\\> "${destPath}"`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  } finally {
    try { execSync(`rm -f "${tmpFile}"`); } catch {}
  }
}

async function main() {
  const missing = Object.keys(IMAGE_SEARCHES).filter(
    (id) => !existsSync(join(imagesDir, `${id}.webp`))
  );
  console.log(`Fetching ${missing.length} missing images...`);

  for (const id of missing) {
    const query = IMAGE_SEARCHES[id];
    const destPath = join(imagesDir, `${id}.webp`);
    try {
      const filename = await searchWikimedia(query);
      if (!filename) { console.log(`⚠️  ${id}: no Wikimedia result for "${query}"`); continue; }
      const directUrl = await getDirectUrl(filename);
      if (!directUrl) { console.log(`⚠️  ${id}: no URL for "${filename}"`); continue; }
      const ok = downloadAndConvert(directUrl, destPath);
      if (ok) {
        console.log(`✅ ${id}: ${filename}`);
      } else {
        console.log(`❌ ${id}: download/convert failed`);
      }
    } catch (err) {
      console.log(`❌ ${id}: ${err.message}`);
    }
    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log("Done.");
}

main().catch(console.error);
