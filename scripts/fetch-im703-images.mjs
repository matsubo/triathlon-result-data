/**
 * Auto-fetch Wikimedia Commons images for 70.3 events listed in
 * /tmp/missing_im703_images.json. Uses the location field as search keyword.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const missing = JSON.parse(
  readFileSync("/tmp/missing_im703_images.json", "utf-8"),
);

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
    if (ii.size && ii.size > 80000) return ii.url;
  }
  return null;
}

async function downloadAndConvert(url, outPath) {
  const tmp = `/tmp/${outPath.split("/").pop().replace(".webp", ".src")}`;
  execSync(`curl -sL -H "User-Agent: Mozilla/5.0" "${url}" -o "${tmp}"`);
  execSync(`magick "${tmp}" -resize 300x200\\> "${outPath}"`);
}

let ok = 0;
let fail = 0;
const failed = [];
for (const m of missing) {
  const outPath = join(repoRoot, m.image);
  if (existsSync(outPath)) {
    ok++;
    continue;
  }
  try {
    const url = await searchImage(m.location);
    if (!url) {
      console.log(`⚠️  ${m.id}: no image (loc=${m.location})`);
      fail++;
      failed.push(m);
      continue;
    }
    await downloadAndConvert(url, outPath);
    ok++;
    if (ok % 10 === 0) console.log(`  ...${ok} done`);
  } catch (err) {
    console.log(`❌ ${m.id}: ${err.message}`);
    fail++;
    failed.push(m);
  }
}
console.log(`\nDone: ${ok} ok, ${fail} failed`);
if (failed.length > 0) {
  writeFileSync(
    "/tmp/failed_im703_images.json",
    JSON.stringify(failed, null, 2),
  );
  console.log("Failed list saved to /tmp/failed_im703_images.json");
}
