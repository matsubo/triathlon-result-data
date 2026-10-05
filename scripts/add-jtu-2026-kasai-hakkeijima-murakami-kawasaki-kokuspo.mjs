// Add the JTU 2026 editions found by the 2026-10-05 /import-race sweep:
//   427 グリーンパーク加西 (2026-09-27), 429 横浜八景島 (2026-09-27),
//   430 村上・笹川流れ (2026-09-27), 435 川崎港 (2026-10-04),
//   425 青の煌めきあおもり国スポ (2026-09-13) — new host-named event
//   `kokuspo_aomori`, per the kokuspo_shiga precedent.
// Built from the deterministic JTU JSON API (`res.body`).
//
// Caption drift handled here (mappings come from the ACTUAL 2026 captions):
//   - kasai: 加算分 (2024 加算秒) -> penalty, TRIJ登録地 (2024 JTU登録地) -> residence.
//   - murakami: SWIM / バイク / ラン instead of スイムラップ / バイクラップ / ランラップ.
//   - hakkeijima: 区分 / 区分順位 (2025 年齢区分 / 年齢別順); no T1 column this year.
//   - kawasaki: 都道府県 -> residence, plus 川崎市 / 川崎市順位 (host-city resident
//     division and rank) -> citizen_category / citizen_rank.
//   - kokuspo: English captions with a leading null-caption internal slug column
//     and an always-empty YOB. Both are dropped and the rest renamed to
//     JTU-standard Japanese headers so tsv-lint's time/rank rules cover them.
//     The tables are split by gender (成年男子 / 成年女子) and carry no gender
//     column, so a constant 性別 column is synthesised from the program.
//
// Excluded per policy: 427_2 リレー, 427_3 パラ, 429_2..13 (S500/S250 and the
// side events, never imported for 2025), 430_2 リレー, 435_1..3 キッズ /
// スーパースプリント (2025 imported only 一般 + スプリント), 435_5 パラ, 435_7 リレー.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const API = "https://results.jtu.or.jp/api";
const UA = "Mozilla/5.0";

// caption (NFKC-folded, spaces stripped) -> meta role
const META = {
  総合順位: "overall_rank", "No.": "bib", 氏名: "name", 年齢: "age", 性別: "gender",
  居住地: "residence", 登録地: "residence", 都道府県: "residence", TRIJ登録地: "residence",
  所属: "residence",
  総合記録: "total_time", 加算分: "penalty", PNLT: "penalty",
  男子順位: "gender_rank", 女子順位: "gender_rank",
  年齢区分: "age_category", 区分: "age_category",
  年齢別順: "age_rank", 年齡別順: "age_rank", 区分順位: "age_rank",
  川崎市: "citizen_category", 川崎市順位: "citizen_rank",
  選手権順: "championship_rank",
};
// caption (NFKC-folded) -> [segment sport, role]
const SEG = {
  スイムラップ: ["swim", "lap"], スイム: ["swim", "lap"], SWIM: ["swim", "lap"],
  S順: ["swim", "rank"], T1: ["swim", "transition"],
  バイクラップ: ["bike", "lap"], バイク: ["bike", "lap"], B順: ["bike", "rank"],
  スプリット: ["bike", "cumulative_time"], 通過: ["bike", "cumulative_rank"],
  T2: ["bike", "transition"],
  ランラップ: ["run", "lap"], ラン: ["run", "lap"], R順: ["run", "rank"],
};

// 国スポ English captions -> JTU-standard headers. null = drop the column.
const KOKUSPO_HEADERS = {
  "": null, YOB: null, Pos: "総合順位", StartNumber: "No.", Name: "氏名",
  Affiliation: "所属", Time: "総合記録", Swim: "スイムラップ", T1: "T1",
  Bike: "バイクラップ", T2: "T2", Run: "ランラップ",
};

const nfkc = (s) => (s || "").normalize("NFKC").replace(/\s+/g, "");

// 姓/名 full-width space, full-width Latin and doubled spaces break cross-event
// athlete matching (CLAUDE.md).
const cleanName = (s) =>
  String(s ?? "")
    .replace(/　/g, " ")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/ {2,}/g, " ")
    .trim();

const KOKUSPO_EVENT = {
  id: "kokuspo_aomori",
  name: "青の煌めきあおもり国民スポーツ大会",
  location: "青森県青森市",
  location_parts: { country: "JP", prefecture: "青森県", city: "青森市" },
  image: "images/kokuspo_aomori.webp",
  source: "https://www.jtu.or.jp/",
};

const OD = { swim: 1.5, bike: 40, run: 10 };
const SD = { swim: 0.75, bike: 20, run: 5 };

const CONFIG = [
  {
    event: "kokuspo_aomori", date: "2026-09-13", rename: KOKUSPO_HEADERS,
    cats: [
      { id: "kokuspo_aomori_men", pid: "425_2", file: "men.tsv", name: "成年男子", dist: "OD", seg: OD, gender: "男",
        description: "2026年青の煌めきあおもり国スポ トライアスロン成年男子。青森市特設トライアスロン会場を舞台に開催。スイム1.5km、バイク40km、ラン10km。" },
      { id: "kokuspo_aomori_women", pid: "425_1", file: "women.tsv", name: "成年女子", dist: "OD", seg: OD, gender: "女",
        description: "2026年青の煌めきあおもり国スポ トライアスロン成年女子。青森市特設トライアスロン会場を舞台に開催。スイム1.5km、バイク40km、ラン10km。" },
    ],
  },
  {
    event: "greenpark_kasai", date: "2026-09-27",
    cats: [
      { id: "greenpark_kasai", pid: "427_1", file: "default.tsv", name: "オリンピックディスタンス", dist: "OD", seg: OD,
        description: "2026年第14回グリーンパークトライアスロンin加西。兵庫県加西市で開催。スイム1.5km、バイク40km、ラン10km。" },
    ],
  },
  {
    event: "yokohama_hakkeijima", date: "2026-09-27",
    cats: [
      { id: "yokohama_hakkeijima", pid: "429_1", file: "default.tsv", name: "スプリントディスタンス", dist: "SD", seg: SD,
        description: "2026年横浜八景島トライアスロンフェスティバル。神奈川県横浜市の八景島を舞台に、スイム750m、バイク20km、ラン5kmのスプリントディスタンスで開催。海と島の美しい景観を楽しみながら競う都市型トライアスロン大会です。" },
    ],
  },
  {
    event: "murakami", date: "2026-09-27",
    cats: [
      { id: "murakami", pid: "430_1", file: "default.tsv", name: "スタンダードディスタンス", dist: "OD", seg: OD,
        description: "2026年村上・笹川流れ国際トライアスロン大会。新潟県村上市の美しい笹川流れと瀬波温泉海岸を舞台に、スイム1.5km、バイク40km、ラン10kmのスタンダードディスタンスで開催。豊かな自然と趣のある町並み、美味しい鮭料理で有名な村上市の魅力を存分に味わえる大会です。NTTトライアスロンエイジグループ・ナショナルチャンピオンシップシリーズ対象大会。" },
    ],
  },
  {
    event: "kawasakiko", date: "2026-10-04",
    cats: [
      { id: "kawasakiko", pid: "435_6", file: "default.tsv", name: "スタンダードディスタンス", dist: "OD", seg: OD,
        description: "2026年第19回川崎港トライアスロンin東扇島。神奈川県川崎市の東扇島を舞台に、スイム1.5km、バイク40km、ラン10kmのスタンダードディスタンスで開催。工業港の独特な景観の中で行われる都市型トライアスロン大会です。" },
      { id: "kawasakiko_sprint", pid: "435_4", file: "sprint.tsv", name: "スプリントディスタンス", dist: "SD", seg: SD,
        description: "2026年第19回川崎港トライアスロンin東扇島 スプリントディスタンス。神奈川県川崎市の東扇島を舞台に、スイム750m、バイク20km、ラン5kmで開催。初心者でも参加しやすい距離設定の都市型トライアスロン大会です。" },
    ],
  },
];

async function jget(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const d = await res.json();
  return d.res.body;
}

async function fetchProgram(pid, rename) {
  const tables = await jget(`${API}/programs/${pid}/result_tables`);
  if (tables.length !== 1) throw new Error(`${pid}: expected 1 result table, got ${tables.length}`);
  const tid = tables[0].result_table_id;
  const r = await jget(`${API}/results?cond%5Bresult_table_id%5D=${tid}`);
  const cols = [...r.result_cols].sort((a, b) => a.result_col_order - b.result_col_order);
  let headers = cols.map((c) => (c.result_col_caption || "").replace(/\n/g, ""));
  let rows = r.result_list.map((row) => cols.map((_, i) => row[`col_${i + 1}`] ?? ""));
  if (rename) {
    for (const h of headers) if (!(h in rename)) throw new Error(`${pid}: unknown caption ${JSON.stringify(h)}`);
    const keep = headers.map((h, i) => (rename[h] === null ? -1 : i)).filter((i) => i >= 0);
    rows = rows.map((row) => keep.map((i) => row[i]));
    headers = keep.map((i) => rename[headers[i]]);
  }
  return { tid, headers, rows };
}

const data = JSON.parse(readFileSync("race-info.json", "utf8"));
const before = data.events.length;
const summary = [];

for (const cfg of CONFIG) {
  let ev = data.events.find((e) => e.id === cfg.event);
  if (!ev) {
    if (cfg.event !== KOKUSPO_EVENT.id) throw new Error(`NO EVENT ${cfg.event}`);
    ev = { ...KOKUSPO_EVENT, editions: [] };
    const anchor = data.events.findIndex((e) => e.id === "kokuspo_shiga");
    data.events.splice(anchor, 0, ev);
  }
  if (ev.editions.some((e) => e.date === cfg.date)) throw new Error(`ALREADY has ${cfg.date}: ${cfg.event}`);

  const categories = [];
  for (const cat of cfg.cats) {
    const fetched = await fetchProgram(cat.pid, cfg.rename);
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
