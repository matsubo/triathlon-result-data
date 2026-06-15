// Import タングラム斑尾ウインタートライアスロン 2025 (JTU event_id 308).
// Winter triathlon: ラン(run) -> MTB(bike) -> XCスキー(treated as run, per 2026 mapping).
// 308_1 エリート has clean result_cols; 308_2 レギュラー has a broken header table
// where the real header is embedded as the first data row -> recover it.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const API = "https://results.jtu.or.jp/api";
const UA = "Mozilla/5.0";
const EVENT = "tangram_madarao";
const DIR = "master/2025/tangram_madarao_2025";

const META = {
  "総合順位": "overall_rank", "No.": "bib", "氏名": "name", "年齢": "age",
  "性別": "gender", "都道府県": "residence", "総合記録": "total_time", "男女別順": "gender_rank",
};
const SEG = { // captions in this winter event
  "ランラップ": ["run", "lap"], "R順": ["run", "rank"],
  "MTB": ["bike", "lap"], "B順": ["bike", "rank"],
  "スプリット": ["bike", "cumulative_time"], "通過": ["bike", "cumulative_rank"],
  "XCスキー": ["run", "lap"], "XC順": ["run", "rank"],
};
const nfkc = (s) => (s || "").normalize("NFKC").replace(/\s+/g, "");

async function jget(u) {
  const r = await fetch(u, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return d.res?.body ?? d.body ?? d;
}
async function fetchProgram(pid) {
  const rt = await jget(`${API}/programs/${pid}/result_tables`);
  const tid = rt[0].result_table_id;
  const r = await jget(`${API}/results?cond%5Bresult_table_id%5D=${tid}`);
  const ncol = r.result_cols.length;
  let headers = [...r.result_cols].sort((a, b) => a.result_col_order - b.result_col_order)
    .map((c) => (c.result_col_caption || "").replace(/\n/g, ""));
  let rows = r.result_list.map((row) => Array.from({ length: ncol }, (_, i) => row[`col_${i + 1}`] ?? ""));
  // Broken table: captions blank/marker -> first data row is the real header
  if (headers.filter((h) => h && !h.startsWith("【")).length < 3) {
    headers = rows[0].map((v) => String(v ?? ""));
    rows = rows.slice(1);
  }
  return { headers, rows };
}

function buildCategory(file, name, headers) {
  const meta = []; const segCols = { swim: [], bike: [], run: [] };
  for (const h of headers) {
    const k = nfkc(h);
    if (META[k]) meta.push({ header: h, role: META[k] });
    else if (SEG[k]) { const [sp, role] = SEG[k]; segCols[sp].push({ header: h, role }); }
  }
  const seg = [];
  for (const sp of ["swim", "bike", "run"]) if (segCols[sp].length) seg.push({ sport: sp, distance: 0, columns: segCols[sp] });
  return { id: `${EVENT}_2025`, result_tsv: `${DIR}/${file}`, name, distance: "OTHER",
    description: `${name}（2025 ウインタートライアスロン）`, segments: seg, meta_columns: meta };
}

const CATS = [
  { pid: "308_1", file: "elite.tsv", name: "エリート" },
  { pid: "308_2", file: "regular.tsv", name: "レギュラー" },
];

const data = JSON.parse(readFileSync("race-info.json", "utf8"));
const ev = data.events.find((e) => e.id === EVENT);
if (!ev) { console.error("no tangram event"); process.exit(1); }
if (ev.editions.some((e) => e.date.startsWith("2025"))) { console.error("already 2025"); process.exit(1); }

const categories = [];
for (const c of CATS) {
  const { headers, rows } = await fetchProgram(c.pid);
  const nameIdx = headers.findIndex((h) => nfkc(h) === "氏名");
  const out = [headers.join("\t")];
  for (const r of rows) {
    const rr = r.map((v) => (v == null ? "" : String(v)));
    if (nameIdx >= 0) rr[nameIdx] = rr[nameIdx].replace(/　/g, " ").trim();
    out.push(rr.join("\t"));
  }
  mkdirSync(dirname(`${DIR}/${c.file}`), { recursive: true });
  writeFileSync(`${DIR}/${c.file}`, `${out.join("\n")}\n`);
  categories.push(buildCategory(c.file, c.name, headers));
  console.log(`${c.file}: ${rows.length} rows, headers=${headers.length}`);
}
const edition = { date: "2025-03-02", weather_file: `${DIR}/weather-data.json`, categories };
const newestFirst = ev.editions[0].date >= ev.editions[ev.editions.length - 1].date;
if (newestFirst) ev.editions.unshift(edition); else ev.editions.push(edition);
writeFileSync("race-info.json", `${JSON.stringify(data, null, 2)}\n`);
console.log("DONE tangram 2025");
