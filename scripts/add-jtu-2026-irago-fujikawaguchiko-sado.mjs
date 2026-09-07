// Add the 2026 editions of 伊良湖 (event_id 422), Mt.富士富士河口湖 (423) and
// 佐渡国際 (424), all raced 2026-09-06, found by the 2026-09-07 /import-race
// discovery run. Built from the deterministic JTU JSON API.
//
// Caption drift handled here (mappings are derived from the ACTUAL 2026
// captions, not cloned from 2025):
//   - irago/sado switched to half-width kana captions (ｽｲﾑﾗｯﾌﾟ / Ｓ順 / ﾗﾝﾗｯﾌﾟ),
//     and to 年齢区分 / 年齡別順 (2025 used 年代区分 / 年代別順). NFKC folding in
//     the role table absorbs the width difference.
//   - irago Aタイプ labels the residence column 登録地; B/C use 居住地. Both map
//     to `residence`.
//   - irago gained a PNLT column in 2026 (absent in 2025) -> role `penalty`.
//   - fujikawaguchiko has no 年齢 column and uses 区分 / 区分順位.
//   - sado keeps a T1 column -> swim transition.
//
// Relay programs are excluded per repository policy: 423_3 リレー (20 rows),
// 424_3 RAタイプ (11), 424_4 RBタイプ (43).
//
// New category this year: fujikawaguchiko 個人ハーフスイム (423_2, 15 athletes) —
// same course as the individual OD race with the swim halved to 0.75km
// (confirmed against the official entry page, mtfuji-tri.jp/entry/, which also
// gives the 2026 bike leg as 41km rather than the 40km recorded for 2025).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const API = "https://results.jtu.or.jp/api";
const UA = "Mozilla/5.0";

// caption (NFKC-folded, spaces stripped) -> meta role
const META = {
  総合順位: "overall_rank", "No.": "bib", 氏名: "name", 年齢: "age",
  性別: "gender", 居住地: "residence", 登録地: "residence", 都道府県: "residence",
  総合記録: "total_time", PNLT: "penalty",
  男子順位: "gender_rank", 女子順位: "gender_rank", 男女別順: "gender_rank",
  年齢区分: "age_category", 年代区分: "age_category", 区分: "age_category",
  年齢別順: "age_rank", 年齡別順: "age_rank", 年代別順: "age_rank", 区分順位: "age_rank",
};
// caption (NFKC-folded) -> [segment sport, role]
const SEG = {
  スイムラップ: ["swim", "lap"], S順: ["swim", "rank"], T1: ["swim", "transition"],
  バイクラップ: ["bike", "lap"], B順: ["bike", "rank"],
  スプリット: ["bike", "cumulative_time"], 通過: ["bike", "cumulative_rank"],
  T2: ["bike", "transition"],
  ランラップ: ["run", "lap"], R順: ["run", "rank"],
};

const nfkc = (s) => (s || "").normalize("NFKC").replace(/\s+/g, "");

// Names arrive with a full-width space between 姓 and 名, and occasionally with
// full-width Latin letters. Both break cross-event athlete matching (CLAUDE.md).
const cleanName = (s) =>
  String(s ?? "")
    .replace(/　/g, " ")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/ {2,}/g, " ")
    .trim();

const CONFIG = [
  {
    event: "irago",
    date: "2026-09-06",
    cats: [
      { id: "irago_a", pid: "422_1", file: "a.tsv", name: "Aタイプ（ミドル）", dist: "MD",
        seg: { swim: 2.25, bike: 74.7, run: 18 },
        description: "2026年第40回トライアスロン伊良湖大会 Aタイプ（ミドルディスタンス）。愛知県田原市伊良湖で開催。" },
      { id: "irago_b", pid: "422_2", file: "b.tsv", name: "Bタイプ（スタンダード）", dist: "OD",
        seg: { swim: 1.5, bike: 44.4, run: 10 },
        description: "2026年第40回トライアスロン伊良湖大会 Bタイプ（スタンダードディスタンス）。愛知県田原市伊良湖で開催。" },
      { id: "irago_c", pid: "422_3", file: "c.tsv", name: "Cタイプ（スプリント）", dist: "SD",
        seg: { swim: 0.75, bike: 14.1, run: 4 },
        description: "2026年第40回トライアスロン伊良湖大会 Cタイプ（スプリントディスタンス）。愛知県田原市伊良湖で開催。" },
    ],
  },
  {
    event: "fujikawaguchiko",
    date: "2026-09-06",
    cats: [
      { id: "fujikawaguchiko", pid: "423_1", file: "default.tsv", name: "オリンピックディスタンス", dist: "OD",
        seg: { swim: 1.5, bike: 41, run: 10 },
        description: "2026年Mt.富士トライアスロン富士河口湖 オリンピックディスタンス。山梨県富士河口湖町の河口湖を舞台に、スイム1.5km、バイク41km、ラン10kmで開催。" },
      { id: "fujikawaguchiko_halfswim", pid: "423_2", file: "halfswim.tsv", name: "個人ハーフスイム", dist: "OD",
        seg: { swim: 0.75, bike: 41, run: 10 },
        description: "2026年Mt.富士トライアスロン富士河口湖 個人ハーフスイム。スイムのみ半分の0.75kmに短縮し、バイク41km・ラン10kmはオリンピックディスタンスと同一コースで開催。" },
    ],
  },
  {
    event: "sado",
    date: "2026-09-06",
    cats: [
      { id: "sado", pid: "424_1", file: "default.tsv", name: "国際Aタイプ（ロングディスタンス）", dist: "LD",
        seg: { swim: 4, bike: 190, run: 42.2 },
        description: "2026年佐渡国際トライアスロン大会 Aタイプ（ロングディスタンス）。新潟県佐渡島を一周するコースで開催。" },
      { id: "sado_b", pid: "424_2", file: "b.tsv", name: "国際Bタイプ（ミドルディスタンス）", dist: "MD",
        seg: { swim: 1.35, bike: 108, run: 21.1 },
        description: "2026年佐渡国際トライアスロン大会 Bタイプ（ミドルディスタンス）。新潟県佐渡島で開催。" },
    ],
  },
];

async function jget(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const d = await res.json();
  return d.res?.body ?? d.body ?? d;
}

async function fetchProgram(pid) {
  const tables = await jget(`${API}/programs/${pid}/result_tables`);
  if (tables.length !== 1) throw new Error(`${pid}: expected 1 result table, got ${tables.length}`);
  const tid = tables[0].result_table_id;
  const r = await jget(`${API}/results?cond%5Bresult_table_id%5D=${tid}`);
  const cols = [...r.result_cols].sort((a, b) => a.result_col_order - b.result_col_order);
  const headers = cols.map((c) => (c.result_col_caption || "").replace(/\n/g, ""));
  const rows = r.result_list.map((row) => cols.map((_, i) => row[`col_${i + 1}`] ?? ""));
  return { tid, headers, rows };
}

const data = JSON.parse(readFileSync("race-info.json", "utf8"));
const summary = [];

for (const cfg of CONFIG) {
  const ev = data.events.find((e) => e.id === cfg.event);
  if (!ev) { console.error(`NO EVENT ${cfg.event}`); process.exit(1); }
  if (ev.editions.some((e) => e.date === cfg.date)) { console.error(`ALREADY has ${cfg.date}: ${cfg.event}`); process.exit(1); }

  const categories = [];
  for (const cat of cfg.cats) {
    const { tid, headers, rows } = await fetchProgram(cat.pid);
    const nameIdx = headers.findIndex((h) => nfkc(h) === "氏名");
    if (nameIdx < 0) { console.error(`${cat.pid}: no 氏名 column`); process.exit(1); }

    const out = [headers.join("\t")];
    for (const r of rows) {
      const rr = r.map((v) => (v == null ? "" : String(v)));
      rr[nameIdx] = cleanName(rr[nameIdx]);
      out.push(rr.join("\t"));
    }
    const tsvPath = `master/2026/${cfg.event}/${cat.file}`;
    mkdirSync(dirname(tsvPath), { recursive: true });
    writeFileSync(tsvPath, `${out.join("\n")}\n`);

    const meta = [];
    const segCols = { swim: [], bike: [], run: [] };
    const unmapped = [];
    for (const h of headers) {
      const key = nfkc(h);
      if (META[key]) meta.push({ header: h, role: META[key] });
      else if (SEG[key]) { const [sp, role] = SEG[key]; segCols[sp].push({ header: h, role }); }
      else unmapped.push(h);
    }
    if (unmapped.length) { console.error(`${cat.id}: UNMAPPED captions ${JSON.stringify(unmapped)}`); process.exit(1); }

    const segments = [];
    for (const sport of ["swim", "bike", "run"]) {
      if (segCols[sport].length) segments.push({ sport, distance: cat.seg[sport], columns: segCols[sport] });
    }

    categories.push({
      id: cat.id,
      result_tsv: tsvPath,
      name: cat.name,
      distance: cat.dist,
      description: cat.description,
      segments,
      meta_columns: meta,
      source_url: `${API}/results?cond[result_table_id]=${tid}`,
    });
    summary.push(`${cat.id}: ${rows.length} rows, ${meta.length} meta, segs=${segments.map((s) => s.sport).join("/")}`);
  }

  const edition = { date: cfg.date, weather_file: `master/2026/${cfg.event}/weather-data.json`, categories };
  const newestFirst = ev.editions[0].date >= ev.editions[ev.editions.length - 1].date;
  if (newestFirst) ev.editions.unshift(edition); else ev.editions.push(edition);
}

writeFileSync("race-info.json", `${JSON.stringify(data, null, 2)}\n`);
console.log(summary.join("\n"));
