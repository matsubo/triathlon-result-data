/**
 * Re-runs the same Wikimedia search used by fetch-im703-images.mjs and
 * reports, for each new 70.3 event, the image that was chosen. Useful for
 * quality-reviewing auto-fetched images.
 *
 * Output: /tmp/im703_image_review.json — sorted so likely-problematic entries
 *         bubble to the top (map/sign/aerial/road keywords in filename).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const raceInfoPath = join(repoRoot, "race-info.json");

const data = JSON.parse(readFileSync(raceInfoPath, "utf-8"));
const plan = JSON.parse(readFileSync("/tmp/import_plan_70_3.json", "utf-8"));
const newIds = new Set(plan.newEvents.map((e) => e.eventId));

const targets = data.events
  .filter((e) => e.id.startsWith("im703") && newIds.has(e.id))
  .map((e) => ({ id: e.id, location: e.location }));

async function searchTop(keyword) {
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
  const pages = (json.query?.pages || []).slice().sort(
    (a, b) => (a.index ?? 999) - (b.index ?? 999),
  );
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii) continue;
    if (ii.size && ii.size > 80000) {
      return { title: p.title, url: ii.url, size: ii.size };
    }
  }
  return null;
}

const SUSPECT_KEYWORDS = [
  "sign", "map", "coat of arms", "logo", "diagram", "schematic",
  "flag", "seal", "poster", "silhouette", "chart", "graph",
  "road sign", "icon",
];

function score(entry) {
  if (!entry.picked) return 100; // no image
  const title = entry.picked.title.toLowerCase();
  let s = 0;
  for (const k of SUSPECT_KEYWORDS) if (title.includes(k)) s += 10;
  // Filename that is just the country name or abstract noun is suspect
  if (title.includes("landsat")) s += 5;
  if (title.includes("aerial view")) s += 3;
  return s;
}

const CONCURRENCY = 4;
const out = [];
for (let i = 0; i < targets.length; i += CONCURRENCY) {
  const batch = targets.slice(i, i + CONCURRENCY);
  const results = await Promise.all(
    batch.map(async (t) => {
      try {
        const picked = await searchTop(t.location);
        return { ...t, picked };
      } catch (err) {
        return { ...t, error: err.message };
      }
    }),
  );
  for (const r of results) {
    out.push(r);
  }
  process.stdout.write(".");
}
console.log();

out.sort((a, b) => score(b) - score(a));

writeFileSync("/tmp/im703_image_review.json", JSON.stringify(out, null, 2));
console.log(`Reviewed ${out.length} events. Top 20 most suspect:\n`);
for (const r of out.slice(0, 20)) {
  const t = r.picked ? r.picked.title : "(NO IMAGE)";
  console.log(`  ${r.id.padEnd(40)} | loc="${r.location}" | ${t}`);
}
console.log("\nFull report: /tmp/im703_image_review.json");
