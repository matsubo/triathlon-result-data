// Import standard JTU 2026 triathlon editions from the deterministic JSON API.
// Builds TSV (captions as header, 氏名 U+3000->half-width) + race-info category
// mapping derived from captions via a role table. Segment distances are reused
// from the same event's most recent prior edition (matching distance type),
// else standard defaults. Weather files are added as references (generated later).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const API = "https://results.jtu.or.jp/api";
const UA = "Mozilla/5.0";

// distance type -> default segment distances [swim, bike, run]
const DIST = { OD: [1.5, 40, 10], SD: [0.75, 20, 5], LD: [3.8, 180.2, 42.195], MD: [1.9, 90, 21.1] };

// caption (NFKC-normalised) -> meta role
const META = {
  "総合順位": "overall_rank", "No.": "bib", "氏名": "name", "年齢": "age",
  "性別": "gender", "居住地": "residence", "登録地": "residence", "都道府県": "residence",
  "総合記録": "total_time", "PNLT": "penalty",
  "男子順位": "gender_rank", "女子順位": "gender_rank", "男女別順": "gender_rank",
  "年齢区分": "age_category", "区分": "age_category",
  "年齢別順": "age_rank", "年齡別順": "age_rank", "区分順位": "age_rank",
};
// caption (NFKC) -> [segment sport, role]
const SEG = {
  "スイムラップ": ["swim", "lap"], "S順": ["swim", "rank"], "T1": ["swim", "transition"],
  "バイクラップ": ["bike", "lap"], "B順": ["bike", "rank"],
  "スプリット": ["bike", "cumulative_time"], "通過": ["bike", "cumulative_rank"],
  "T2": ["bike", "transition"],
  "ランラップ": ["run", "lap"], "R順": ["run", "rank"],
};
const nfkc = (s) => (s || "").normalize("NFKC").replace(/\s+/g, "");

const CONFIG = [
  { event: "kisosangawa", date: "2026-06-07", cats: [
    { pid: "394_3", name: "トライアスロン（エイジ）", dist: "OD", file: "default.tsv" } ] },
  { event: "kanagawa", date: "2026-06-14", cats: [
    { pid: "395_3", name: "オリンピックディスタンス", dist: "OD", file: "default.tsv" },
    { pid: "395_5", name: "スプリントディスタンス", dist: "SD", file: "sprint.tsv" } ] },
  { event: "baramon", date: "2026-06-14", cats: [
    { pid: "396_1", name: "タイプA（ロングディスタンス）", dist: "LD", file: "a.tsv" },
    { pid: "396_2", name: "タイプB（ミドルディスタンス）", dist: "MD", file: "b.tsv" } ] },
  { event: "uminomori", date: "2026-06-14", cats: [
    { pid: "397_1", name: "オリンピックディスタンス", dist: "OD", file: "short.tsv" },
    { pid: "397_3", name: "スプリント・一般", dist: "SD", file: "sprint.tsv" } ] },
];

async function jget(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const d = await res.json();
  return d.res?.body ?? d.body ?? d;
}
async function fetchProgram(pid) {
  const rt = await jget(`${API}/programs/${pid}/result_tables`);
  const tid = rt[0].result_table_id;
  const r = await jget(`${API}/results?cond%5Bresult_table_id%5D=${tid}`);
  const cols = [...r.result_cols].sort((a, b) => a.result_col_order - b.result_col_order);
  const headers = cols.map((c) => (c.result_col_caption || "").replace(/\n/g, ""));
  const rows = r.result_list.map((row) => cols.map((_, i) => row[`col_${i + 1}`] ?? ""));
  return { headers, rows };
}

function priorSegDistances(event, distType) {
  // find same event's most recent edition whose a category has matching `distance`
  const ed = [...event.editions].sort((a, b) => b.date.localeCompare(a.date));
  for (const e of ed) {
    for (const c of e.categories) {
      if (c.distance === distType) {
        const m = {};
        for (const s of c.segments) if (s.distance != null) m[s.sport] = s.distance;
        if (Object.keys(m).length) return m;
      }
    }
  }
  return null;
}

const data = JSON.parse(readFileSync("race-info.json", "utf8"));
const summary = [];

for (const cfg of CONFIG) {
  const ev = data.events.find((e) => e.id === cfg.event);
  if (!ev) { console.error(`NO EVENT ${cfg.event}`); process.exit(1); }
  if (ev.editions.some((e) => e.date.startsWith("2026"))) { console.error(`ALREADY 2026: ${cfg.event}`); process.exit(1); }
  const categories = [];
  for (const cat of cfg.cats) {
    const { headers, rows } = await fetchProgram(cat.pid);
    const nameIdx = headers.findIndex((h) => nfkc(h) === "氏名");
    // write TSV (clean 氏名 spaces)
    const out = [headers.join("\t")];
    for (const r of rows) {
      const rr = r.map((v) => (v == null ? "" : String(v)));
      if (nameIdx >= 0) rr[nameIdx] = rr[nameIdx].replace(/　/g, " ").trim();
      out.push(rr.join("\t"));
    }
    const tsvPath = `master/2026/${cfg.event}/${cat.file}`;
    mkdirSync(dirname(tsvPath), { recursive: true });
    writeFileSync(tsvPath, `${out.join("\n")}\n`);
    const segDist = priorSegDistances(ev, cat.dist);
    const [ds, db, dr] = DIST[cat.dist];
    const nameI = headers.findIndex((h) => nfkc(h) === "氏名");
    const meta = []; const segCols = { swim: [], bike: [], run: [] };
    for (const h of headers) {
      const key = nfkc(h);
      if (META[key]) meta.push({ header: h, role: META[key] });
      else if (SEG[key]) { const [sp, role] = SEG[key]; segCols[sp].push({ header: h, role }); }
    }
    const seg = [];
    if (segCols.swim.length) seg.push({ sport: "swim", distance: segDist?.swim ?? ds, columns: segCols.swim });
    if (segCols.bike.length) seg.push({ sport: "bike", distance: segDist?.bike ?? db, columns: segCols.bike });
    if (segCols.run.length) seg.push({ sport: "run", distance: segDist?.run ?? dr, columns: segCols.run });
    categories.push({
      id: cfg.event, result_tsv: tsvPath, name: cat.name, distance: cat.dist,
      description: `${cat.name}（2026）`, segments: seg, meta_columns: meta,
    });
    summary.push(`${cfg.event}/${cat.file}: ${rows.length} rows, ${meta.length} meta, segs=${seg.map((s) => s.sport).join("/")}`);
  }
  const edition = { date: cfg.date, weather_file: `master/2026/${cfg.event}/weather-data.json`, categories };
  const newestFirst = ev.editions[0].date >= ev.editions[ev.editions.length - 1].date;
  if (newestFirst) ev.editions.unshift(edition); else ev.editions.push(edition);
}

writeFileSync("race-info.json", `${JSON.stringify(data, null, 2)}\n`);
console.log(summary.join("\n"));
console.log("DONE JTU 4 events");
