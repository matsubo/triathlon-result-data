// Add the JTU 2026 editions found by the 2026-10-12 /import-race sweep:
//   436 千葉シティ (2026-10-11)        -> chibacity   (スタンダード 436_1, スプリント 436_3)
//   437 霞ヶ浦国際 (2026-10-11)        -> kasumigaura (ミドル 437_1, スタンダード 437_3)
//   428 日本スプリント選手権 宮崎 (2026-09-27) -> NEW host-named event
//       `sprint_championship_miyazaki` (エリート男子 428_1, エリート女子 428_2), per the
//       sprint_championship_aomori precedent. Re-applied on user request from
//       branch backup/import-2026-10-09, whose TSVs / weather / image this
//       script's output must match; this script owns the race-info entries.
// Built from the deterministic JTU JSON API (`res.body`).
//
// Caption handling (from the ACTUAL 2026 captions):
//   - chibacity: スイム / バイク / ラン are renamed to スイムラップ / バイクラップ /
//     ランラップ, the headers of the 2025 TSVs; the bare captions are not
//     matched by tsv-lint's time-format rule.
//   - kasumigaura: half-width kana / full-width-letter captions kept verbatim
//     (ｽｲﾑﾗｯﾌﾟ, Ｓ順, 年齡別順 …), as in the 2024 TSVs. No T1/T2 columns.
//     The swim was held this year (2024 was run-bike-run). ミドル is K100:
//     2.0 / 78 / 20 km per kasumigaura-tf.com/gaiyou/ (2023 was 2 / 60 / 20).
//   - miyazaki: English elite captions with a leading null-caption slug column
//     (dropped), "Start\nNum", and zero-padded hours ("00:55:32"). Per-gender
//     tables without a gender column, so 性別 is synthesised from the program.
//
// Excluded per policy / the 2025 precedent: 436_2 リレー, 436_4 ビギナー,
// 436_5 ビギナーリレー, 436_6..8 ジュニア, 436_9 キャラクターデュアスロン,
// 437_2 / 437_4 / 437_6 リレー, 437_5 ビギナー, 438 パラカップ (whole event).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const API = "https://results.jtu.or.jp/api";
const UA = "Mozilla/5.0";

// caption (NFKC-folded, spaces stripped) -> meta role
const META = {
  総合順位: "overall_rank", "No.": "bib", 氏名: "name", 年齢: "age", 性別: "gender",
  居住地: "residence", 所属: "residence",
  総合記録: "total_time",
  男子順位: "gender_rank", 女子順位: "gender_rank",
  年齢区分: "age_category", 区分: "age_category",
  年齢別順: "age_rank", 年齡別順: "age_rank", 区分順位: "age_rank",
};
// caption (NFKC-folded) -> [segment sport, role]
const SEG = {
  スイムラップ: ["swim", "lap"], S順: ["swim", "rank"], T1: ["swim", "transition"],
  バイクラップ: ["bike", "lap"], B順: ["bike", "rank"],
  スプリット: ["bike", "cumulative_time"], 通過: ["bike", "cumulative_rank"],
  T2: ["bike", "transition"],
  ランラップ: ["run", "lap"], R順: ["run", "rank"],
};

const CHIBA_HEADERS = { スイム: "スイムラップ", バイク: "バイクラップ", ラン: "ランラップ" };
// Elite English captions -> JTU-standard headers. null = drop the column.
// YOB is kept (unmapped in race-info, as in sprint_championship_aomori 2025).
const ELITE_HEADERS = {
  "": null, Pos: "総合順位", StartNum: "No.", Name: "氏名", Affiliation: "所属",
  YOB: "YOB", Time: "総合記録", Swim: "スイムラップ", T1: "T1", Bike: "バイクラップ",
  T2: "T2", Split: "スプリット", Run: "ランラップ",
};

const nfkc = (s) => (s || "").normalize("NFKC").replace(/\s+/g, "");

// 姓/名 full-width space, full-width Latin and doubled spaces break cross-event
// athlete matching (AGENTS.md). `．` occurs inside a romanised name (Ｚ．Ａｂｉｄｉｎ).
const cleanName = (s) =>
  String(s ?? "")
    .replace(/　/g, " ")
    .replace(/[Ａ-Ｚａ-ｚ０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/ {2,}/g, " ")
    .trim();
// "00:55:32" -> "0:55:32" (the elite tables zero-pad the hour)
const cleanCell = (s) => s.replace(/^0(\d:\d{2}:\d{2})$/, "$1");

const MIYAZAKI_EVENT = {
  id: "sprint_championship_miyazaki",
  name: "日本スプリントトライアスロン選手権（宮崎）",
  location: "宮崎県宮崎市",
  location_parts: { country: "JP", prefecture: "宮崎県", city: "宮崎市" },
  image: "images/sprint_championship_miyazaki.webp",
  source: "https://www.jtu.or.jp/championship-series/sprint/",
};

const OD = { swim: 1.5, bike: 40, run: 10 };
const SD = { swim: 0.75, bike: 20, run: 5 };
const K100 = { swim: 2, bike: 78, run: 20 };

const KASUMI = "茨城県土浦市のリンリンポート土浦周辺特設コース（スイム：土浦新港内、バイク：つくば霞ヶ浦りんりんロード、ラン：会場周辺・J:COMスタジアム土浦）で開催";
const MIYAZAKI = (cat) =>
  `2026年第17回日本スプリントトライアスロン選手権（宮崎） ${cat}。みやざき臨海公園特設会場で開催。スイム0.75km、バイク20km、ラン5km。ドラフティング許可レース。`;

const CONFIG = [
  {
    event: "chibacity", date: "2026-10-11", rename: CHIBA_HEADERS,
    cats: [
      { id: "chibacity", pid: "436_1", file: "default.tsv", name: "スタンダード", dist: "OD", seg: OD,
        description: "2026年千葉シティトライアスロン大会。千葉県千葉市の稲毛海浜公園を舞台に、スイム1.5km、バイク40km、ラン10kmのスタンダードディスタンスで開催。都市近郊の海岸を活用した、アクセスの良い大会です。" },
      { id: "chibacity_sprint", pid: "436_3", file: "sprint.tsv", name: "スプリント", dist: "SD", seg: SD,
        description: "2026年千葉シティトライアスロン大会 スプリント。千葉県千葉市の稲毛海浜公園を舞台に、スイム750m、バイク20km、ラン5kmのスプリントディスタンスで開催。初心者でも参加しやすい距離設定の大会です。" },
    ],
  },
  {
    event: "kasumigaura", date: "2026-10-11",
    cats: [
      { id: "kasumigaura_middle", pid: "437_1", file: "middle.tsv", name: "ミドルディスタンス", dist: "MD", seg: K100,
        description: `2026年第6回霞ヶ浦国際トライアスロンフェスタ ミドルの部（K100）。${KASUMI}。スイム2.0km、バイク78km、ラン20km。` },
      { id: "kasumigaura_standard", pid: "437_3", file: "standard.tsv", name: "スタンダードディスタンス", dist: "OD", seg: OD,
        description: `2026年第6回霞ヶ浦国際トライアスロンフェスタ スタンダードの部。${KASUMI}。スイム1.5km、バイク40km、ラン10km。` },
    ],
  },
  {
    event: MIYAZAKI_EVENT.id, date: "2026-09-27", rename: ELITE_HEADERS, elite: true,
    cats: [
      { id: "sprint_championship_miyazaki_men", pid: "428_1", file: "men.tsv", name: "エリート男子", dist: "SD", seg: SD, gender: "男",
        description: MIYAZAKI("エリート男子") },
      { id: "sprint_championship_miyazaki_women", pid: "428_2", file: "women.tsv", name: "エリート女子", dist: "SD", seg: SD, gender: "女",
        description: MIYAZAKI("エリート女子") },
    ],
  },
];

async function jget(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const d = await res.json();
  return d.res.body;
}

async function fetchProgram(pid, rename, strict) {
  const tables = await jget(`${API}/programs/${pid}/result_tables`);
  if (tables.length !== 1) throw new Error(`${pid}: expected 1 result table, got ${tables.length}`);
  const tid = tables[0].result_table_id;
  const r = await jget(`${API}/results?cond%5Bresult_table_id%5D=${tid}`);
  const cols = [...r.result_cols].sort((a, b) => a.result_col_order - b.result_col_order);
  let headers = cols.map((c) => (c.result_col_caption || "").replace(/\n/g, ""));
  let rows = r.result_list.map((row) => cols.map((_, i) => row[`col_${i + 1}`] ?? ""));
  if (rows.length === 0) throw new Error(`${pid}: 0 rows`);
  if (rename) {
    if (strict) for (const h of headers) if (!(h in rename)) throw new Error(`${pid}: unknown caption ${JSON.stringify(h)}`);
    const keep = headers.map((h, i) => (rename[h] === null ? -1 : i)).filter((i) => i >= 0);
    rows = rows.map((row) => keep.map((i) => row[i]));
    headers = keep.map((i) => rename[headers[i]] ?? headers[i]);
  }
  return { tid, headers, rows };
}

const data = JSON.parse(readFileSync("race-info.json", "utf8"));
const before = data.events.length;
const summary = [];

for (const cfg of CONFIG) {
  let ev = data.events.find((e) => e.id === cfg.event);
  if (!ev) {
    if (cfg.event !== MIYAZAKI_EVENT.id) throw new Error(`NO EVENT ${cfg.event}`);
    ev = { ...MIYAZAKI_EVENT, editions: [] };
    const anchor = data.events.findIndex((e) => e.id === "sprint_championship_aomori");
    if (anchor < 0) throw new Error("NO sprint_championship_aomori anchor");
    data.events.splice(anchor, 0, ev);
  }
  if (ev.editions.some((e) => e.date === cfg.date)) throw new Error(`ALREADY has ${cfg.date}: ${cfg.event}`);

  const categories = [];
  for (const cat of cfg.cats) {
    const fetched = await fetchProgram(cat.pid, cfg.rename, cfg.elite);
    const { tid } = fetched;
    let { headers, rows } = fetched;
    if (cat.gender) {
      // Insert 性別 right after 氏名, matching the usual JTU column order.
      const at = headers.indexOf("氏名") + 1;
      headers = [...headers.slice(0, at), "性別", ...headers.slice(at)];
      rows = rows.map((r) => [...r.slice(0, at), cat.gender, ...r.slice(at)]);
    }
    const nameIdx = headers.findIndex((h) => nfkc(h) === "氏名");
    if (nameIdx < 0) throw new Error(`${cat.pid}: no 氏名 column`);

    const out = [headers.join("\t")];
    for (const r of rows) {
      const rr = r.map((v) => cleanCell(v == null ? "" : String(v)));
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
      } else if (key !== "YOB") unmapped.push(h);
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

writeFileSync("race-info.json", `${JSON.stringify(data, null, 2)}\n`);
console.log(summary.join("\n"));
console.log(`events ${before} -> ${data.events.length}`);
