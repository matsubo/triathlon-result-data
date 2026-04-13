/**
 * Fetch a Wikimedia Commons image for each Ironman event that lacks one.
 * Uses the Commons API to search by location keyword, downloads the first
 * sufficiently-sized JPG/PNG, and converts to webp via ImageMagick.
 *
 * Usage: node scripts/fetch-event-images.mjs
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

// (eventId, search keyword) — keyword targets a recognizable place
const QUERIES = {
  ironman_coeur_dalene:        "Coeur d'Alene Idaho lake",
  ironman_cozumel:             "Cozumel Mexico beach",
  ironman_lake_placid:         "Lake Placid New York",
  ironman_louisville:          "Louisville Kentucky Ohio River",
  ironman_melbourne:           "Melbourne Australia skyline",
  ironman_mont_tremblant:      "Mont Tremblant Quebec",
  ironman_new_york:            "New York City skyline",
  ironman_new_zealand:         "Taupo New Zealand lake",
  ironman_regensburg:          "Regensburg Germany Danube",
  ironman_st_george:           "St George Utah",
  ironman_uk:                  "Bolton England",
  ironman_western_australia:   "Busselton jetty Western Australia",
  ironman_los_cabos:           "Cabo San Lucas Mexico",
  ironman_japan:               "Goto Islands Nagasaki",
  ironman_lake_tahoe:          "Lake Tahoe California",
  ironman_boulder:             "Boulder Colorado Flatirons",
  ironman_mallorca:            "Alcudia Mallorca Spain",
  ironman_fortaleza:           "Fortaleza Brazil beach",
  ironman_maastricht_limburg:  "Maastricht Netherlands",
  ironman_vichy:               "Vichy France",
  ironman_muskoka:             "Huntsville Ontario Muskoka",
  ironman_weymouth:            "Weymouth England beach",
  ironman_santa_rosa:          "Santa Rosa California",
  ironman_north_carolina:      "Wilmington North Carolina",
  ironman_argentina:           "Mar del Plata Argentina",
  ironman_philippines:         "Subic Bay Philippines",
  ironman_norway:              "Haugesund Norway",
  ironman_ireland:             "Cork Ireland harbour",
  ironman_tulsa:               "Tulsa Oklahoma",
  ironman_china:               "Hainan China beach",
  ironman_kazakhstan:          "Astana Kazakhstan",
  ironman_indiana:             "Muncie Indiana",
  ironman_finland:             "Lahti Finland lake",
  ironman_gdynia:              "Gdynia Poland harbour",
  ironman_world_championship_st_george: "St George Utah Snow Canyon",
  ironman_des_moines:          "Des Moines Iowa",
  ironman_alaska:              "Juneau Alaska",
  ironman_pays_aix:            "Aix-en-Provence France",
  ironman_waco:                "Waco Texas",
  ironman_israel:              "Tiberias Israel Sea of Galilee",
  ironman_ottawa:              "Ottawa Ontario",
  ironman_penghu:              "Penghu Taiwan",
  ironman_vietnam:             "Da Nang Vietnam beach",
  ironman_jacksonville:        "Jacksonville Florida",
  ironman_tours_metropole:     "Tours France Loire",
};

async function searchImage(keyword) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `${keyword} filemime:image/jpeg`,
    gsrnamespace: "6",
    gsrlimit: "10",
    prop: "imageinfo",
    iiprop: "url|size|mime",
    format: "json",
    formatversion: "2",
  }).toString();
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "Mozilla/5.0 (triathlon-result-data importer)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const pages = json.query?.pages || [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii) continue;
    if (ii.mime && !ii.mime.startsWith("image/")) continue;
    if (ii.size && ii.size > 80000) {
      return ii.url;
    }
  }
  return null;
}

async function downloadAndConvert(url, outPath) {
  const tmp = `/tmp/${outPath.split("/").pop().replace(".webp", ".src")}`;
  execSync(`curl -sL -H "User-Agent: Mozilla/5.0" "${url}" -o "${tmp}"`);
  execSync(`magick "${tmp}" -resize 300x200\\> "${outPath}"`);
}

async function main() {
  const ids = Object.keys(QUERIES);
  console.log(`Fetching images for ${ids.length} events...`);
  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const id of ids) {
    const outPath = join(repoRoot, "images", `${id}.webp`);
    if (existsSync(outPath)) {
      console.log(`⏭️  ${id}: already exists`);
      skip++;
      continue;
    }
    try {
      const url = await searchImage(QUERIES[id]);
      if (!url) {
        console.log(`⚠️  ${id}: no image found`);
        fail++;
        continue;
      }
      await downloadAndConvert(url, outPath);
      console.log(`✅ ${id}: ${url.split("/").pop()}`);
      ok++;
    } catch (err) {
      console.log(`❌ ${id}: ${err.message}`);
      fail++;
    }
  }
  console.log(`\nDone: ${ok} ok, ${skip} skipped, ${fail} failed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
