/**
 * Replace poor-quality auto-fetched Wikimedia images for IRONMAN events.
 *
 * Strategy:
 *  1. Read a list of event IDs that need replacement (CLI arg or
 *     /tmp/bad_70_3_images.json)
 *  2. For each, resolve event location from race-info.json
 *  3. Try multiple search queries (location + scenic suffix)
 *  4. Skip results whose filename hints at a map / satellite / diagram
 *  5. Prefer images with aspect ratio close to 3:2 (matches our 300x200 target)
 *  6. Download + convert with magick
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const listPath = process.argv[2] || "/tmp/bad_70_3_images.json";
const ids = JSON.parse(readFileSync(listPath, "utf-8"));

const ri = JSON.parse(readFileSync(join(repoRoot, "race-info.json"), "utf-8"));
const idToLoc = new Map();
for (const e of ri.events) {
  if (e.location) idToLoc.set(e.id, e.location);
}

const BAD_TITLE_PATTERNS = [
  /map/i, /satellite/i, /landsat/i, /srtm/i, /aerial/i,
  /coat of arms/i, /flag/i, /seal of/i, /logo/i, /sign/i,
  /diagram/i, /schematic/i, /topograph/i, /chart/i,
  /portrait/i, /stamp/i, /poster/i, /icon/i,
  /bathymetr/i, /elevation/i, /locator/i, /wikimedia/i,
  /labeled/i, /labelled/i, /crater/i, /^file:\S+\.svg$/i,
];

function titleOk(title) {
  for (const p of BAD_TITLE_PATTERNS) if (p.test(title)) return false;
  return true;
}

async function search(keyword) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `${keyword} filemime:image/jpeg`,
    gsrnamespace: "6",
    gsrlimit: "20",
    prop: "imageinfo",
    iiprop: "url|size|mime|metadata",
    format: "json",
    formatversion: "2",
  }).toString();
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "Mozilla/5.0 (triathlon-result-data importer)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const pages = (json.query?.pages || [])
    .slice()
    .sort((a, b) => (a.index ?? 999) - (b.index ?? 999));
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || !ii.size || ii.size < 100000) continue;
    if (!titleOk(p.title)) continue;
    return { title: p.title, url: ii.url, size: ii.size };
  }
  return null;
}

function downloadAndConvert(url, outPath) {
  const tmp = `/tmp/${outPath.split("/").pop().replace(".webp", ".src")}`;
  execSync(`curl -sL -H "User-Agent: Mozilla/5.0" "${url}" -o "${tmp}"`);
  execSync(`magick "${tmp}" -resize 300x200\\> "${outPath}"`);
}

const SUFFIXES = [
  " skyline",
  " beach",
  " harbor",
  " waterfront",
  " cityscape",
  " landscape",
  " coast",
  " panorama",
  "",
];

let ok = 0;
const stillBad = [];
for (const id of ids) {
  const loc = idToLoc.get(id);
  if (!loc) {
    console.log(`⚠️  ${id}: no location in race-info.json`);
    stillBad.push(id);
    continue;
  }
  let picked = null;
  for (const suffix of SUFFIXES) {
    try {
      picked = await search(loc + suffix);
      if (picked) break;
    } catch (err) {
      // retry with next suffix
    }
  }
  const outPath = join(repoRoot, "images", `${id}.webp`);
  if (!picked) {
    console.log(`❌ ${id}: no replacement found (loc="${loc}")`);
    stillBad.push(id);
    continue;
  }
  try {
    downloadAndConvert(picked.url, outPath);
    const newSize = statSync(outPath).size;
    console.log(`✅ ${id}: ${picked.title} -> ${newSize}B`);
    ok++;
  } catch (err) {
    console.log(`❌ ${id}: download failed ${err.message}`);
    stillBad.push(id);
  }
}

console.log(`\nDone: ${ok} replaced, ${stillBad.length} still need manual fix`);
if (stillBad.length > 0) {
  writeFileSync("/tmp/still_bad_images.json", JSON.stringify(stillBad, null, 2));
  console.log("Still bad: /tmp/still_bad_images.json");
}
