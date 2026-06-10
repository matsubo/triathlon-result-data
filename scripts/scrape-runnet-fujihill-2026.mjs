// Scrape official Mt.富士ヒルクライム 2026 (第22回) results from result.one.runnet.jp
// API: /api/races/{raceId}/general-categories/{catId}?page=N&num=M&isFixed=true&location=L&order=GENERAL
// location: 1=Start, 2=19km, 3=20km, 4=Finish (default)
// Joins athletes across locations by bibNo to assemble split times.
import { writeFileSync } from "node:fs";

const RACE_ID = 383993;
const BASE = `https://result.one.runnet.jp/api/races/${RACE_ID}/general-categories`;
const NUM = 100; // page size (server caps somewhere between 200 and 500)
const UA = "Mozilla/5.0";

// categoryId -> { label, gender }
const CATEGORIES = [
  { id: 1, label: "主催者選抜クラス男子", gender: "M" },
  { id: 3, label: "主催者選抜クラス女子", gender: "F" },
  { id: 5, label: "一般男子", gender: "M" },
  { id: 6, label: "一般女子", gender: "F" },
];
const LOCATIONS = { start: 1, k19: 2, k20: 3, finish: 4 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === 3) throw err;
      await sleep(500 * (attempt + 1));
    }
  }
}

async function fetchCategoryLocation(catId, location) {
  const out = [];
  let page = 0;
  let total = Infinity;
  while (out.length < total) {
    const url = `${BASE}/${catId}?page=${page}&num=${NUM}&isFixed=true&location=${location}&order=GENERAL`;
    const data = await fetchJson(url);
    total = data.countGeneral ?? 0;
    const athletes = data.athletes ?? [];
    if (athletes.length === 0) break;
    out.push(...athletes);
    page += 1;
    await sleep(120);
  }
  return out;
}

async function main() {
  const result = {};
  for (const cat of CATEGORIES) {
    const byBib = new Map();
    for (const [locName, locId] of Object.entries(LOCATIONS)) {
      const rows = await fetchCategoryLocation(cat.id, locId);
      for (const a of rows) {
        const bib = a.bibNo;
        if (!byBib.has(bib)) {
          byBib.set(bib, {
            bib,
            name: a.name,
            categoryLabel: cat.label,
            gender: cat.gender,
          });
        }
        const rec = byBib.get(bib);
        rec[`${locName}_net`] = a.netTime || "";
        rec[`${locName}_gross`] = a.grossTime || "";
        if (locName === "finish") {
          rec.generalRank = a.generalRank;
          rec.categoryRank = a.categoryRank;
        }
      }
      process.stderr.write(`cat ${cat.id} (${cat.label}) loc ${locName}: ${rows.length} rows\n`);
    }
    result[cat.id] = [...byBib.values()];
  }
  writeFileSync("/tmp/fujihill2026-official.json", JSON.stringify(result, null, 2));
  const counts = Object.entries(result).map(([id, arr]) => `${id}:${arr.length}`).join(" ");
  process.stderr.write(`DONE counts ${counts}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
