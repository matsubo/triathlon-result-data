// Add the JTU 2026 editions found by the 2026-10-19 /import-race sweep
// (imported 2026-10-19 on user request, all candidates except the super sprint
// championship 441):
//   440 長良川ミドル102秋 (2026-10-18)      -> nagaragawa_aki  (ミドルディスタンス102 440_1)
//   443 今治伯方島 (2026-10-18)             -> imabari_hakata  (スタンダード 443_1)
//   442 東京・海の森スプリント (2026-10-17) -> uminomorisptri  (スプリント・一般 442_1)
// Built from the deterministic JTU JSON API (`res.body`).
//
// Captions are kept verbatim (half-width kana ｽｲﾑﾗｯﾌﾟ, full-width Ｓ順, the
// 年齡 variant) and mapped from the ACTUAL 2026 captions:
//   - 440: 所属／登録 -> residence (as in 2025); JTU番号 (new this year, the
//     athlete's JTU membership number) -> note.
//   - 443: ﾍﾟﾅﾙﾃｨ -> penalty; 男女別順 (one gender-rank column instead of
//     男子順位 / 女子順位) -> gender_rank. No T1/T2 columns, as in 2025.
//   - 442: no T1/T2 or penalty columns this year (2025 had both).
//
// Excluded per policy / the 2025 precedent: 440_2..5 アクアバイク / アクアスロン,
// 443_2 リレー, 442_2 高校生, 442_3 パラ, 442_4 / 442_7 / 442_8 リレー,
// 442_5 スーパースプリント・一般, 442_6 中学生, and 441 日本スーパースプリント
// 選手権 (whole event, by user choice).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const API = "https://results.jtu.or.jp/api";
const UA = "Mozilla/5.0";

// caption (NFKC-folded, spaces stripped) -> meta role
const META = {
  総合順位: "overall_rank", "No.": "bib", 氏名: "name", 年齢: "age", 性別: "gender",
  居住地: "residence", "所属/登録": "residence",
  総合記録: "total_time", ペナルティ: "penalty",
  男子順位: "gender_rank", 女子順位: "gender_rank", 男女別順: "gender_rank",
  年齢区分: "age_category",
  年齢別順: "age_rank", 年齡別順: "age_rank",
  JTU番号: "note",
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

// 姓/名 full-width space, full-width Latin and doubled spaces break cross-event
// athlete matching (AGENTS.md).
const cleanName = (s) =>
  String(s ?? "")
    .replace(/　/g, " ")
    .replace(/[Ａ-Ｚａ-ｚ０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/ {2,}/g, " ")
    .trim();

const MD102 = { swim: 2, bike: 80, run: 20 };
const OD = { swim: 1.5, bike: 40, run: 10 };
const SD = { swim: 0.75, bike: 20, run: 5 };

const CONFIG = [
  {
    event: "nagaragawa_aki", date: "2026-10-18",
    cats: [
      { id: "nagaragawa_aki", pid: "440_1", file: "default.tsv", name: "ミドルディスタンス102", dist: "MD", seg: MD102,
        description: "2026年第5回長良川ミドルトライアスロン102秋。岐阜県海津市の国営木曽三川公園を舞台に、スイム2km、バイク80km、ラン20kmの総距離102kmに挑戦。" },
    ],
  },
  {
    event: "imabari_hakata", date: "2026-10-18",
    cats: [
      { id: "imabari_hakata", pid: "443_1", file: "default.tsv", name: "オリンピックディスタンス", dist: "OD", seg: OD,
        description: "2026年瀬戸内しまなみ海道 今治伯方島トライアスロン。愛媛県今治市の伯方Ｓ・Ｃパークを舞台に、スイム1.5km、バイク40km、ラン10kmのオリンピックディスタンスで開催。美しい海と島々を望む絶景の中で行われる大会です。" },
    ],
  },
  {
    event: "uminomorisptri", date: "2026-10-17",
    cats: [
      { id: "uminomorisptri", pid: "442_1", file: "default.tsv", name: "スプリント・一般", dist: "SD", seg: SD,
        description: "2026年東京・海の森スプリントトライアスロン スプリント・一般。東京都江東区の海の森水上競技場で、スイム0.75km、バイク20km、ラン5kmのスプリントディスタンスで開催。" },
    ],
  },
];

async function jget(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()).res.body;
}

async function fetchProgram(pid) {
  const tables = await jget(`${API}/programs/${pid}/result_tables`);
  if (tables.length !== 1) throw new Error(`${pid}: expected 1 result table, got ${tables.length}`);
  const tid = tables[0].result_table_id;
  const r = await jget(`${API}/results?cond%5Bresult_table_id%5D=${tid}`);
  const cols = [...r.result_cols].sort((a, b) => a.result_col_order - b.result_col_order);
  const headers = cols.map((c) => (c.result_col_caption || "").replace(/\n/g, ""));
  const rows = r.result_list.map((row) => cols.map((_, i) => row[`col_${i + 1}`] ?? ""));
  if (rows.length === 0) throw new Error(`${pid}: 0 rows`);
  return { tid, headers, rows };
}

const data = JSON.parse(readFileSync("race-info.json", "utf8"));
const before = data.events.length;
const summary = [];

for (const cfg of CONFIG) {
  const ev = data.events.find((e) => e.id === cfg.event);
  if (!ev) throw new Error(`NO EVENT ${cfg.event}`);
  if (ev.editions.some((e) => e.date === cfg.date)) throw new Error(`ALREADY has ${cfg.date}: ${cfg.event}`);

  const categories = [];
  for (const cat of cfg.cats) {
    const { tid, headers, rows } = await fetchProgram(cat.pid);
    const nameIdx = headers.findIndex((h) => nfkc(h) === "氏名");
    if (nameIdx < 0) throw new Error(`${cat.pid}: no 氏名 column`);

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
      else if (SEG[key]) {
        const [sp, role] = SEG[key];
        segCols[sp].push({ header: h, role });
      } else unmapped.push(h);
    }
    if (unmapped.length) throw new Error(`${cat.id}: UNMAPPED captions ${JSON.stringify(unmapped)}`);

    const segments = ["swim", "bike", "run"]
      .filter((sport) => segCols[sport].length)
      .map((sport) => ({ sport, distance: cat.seg[sport], columns: segCols[sport] }));
    if (segments.length !== 3) throw new Error(`${cat.id}: expected swim/bike/run, got ${segments.map((s) => s.sport)}`);

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
  const newestFirst = !ev.editions.length || ev.editions[0].date >= ev.editions[ev.editions.length - 1].date;
  if (newestFirst) ev.editions.unshift(edition);
  else ev.editions.push(edition);
}

if (data.events.length !== before) throw new Error("event count changed");
writeFileSync("race-info.json", `${JSON.stringify(data, null, 2)}\n`);
console.log(summary.join("\n"));
