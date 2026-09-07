// Add the 2026 edition (Standard + Sprint) of おもてなし山形トライアスロンin ZAO
// (event_id 421), found by the 2026-08-31 /import-race discovery run.
// Captions drifted from the 2025 edition: 都道府県 (not 居住地), 区分順位 (not
// 年齡別順), and a new column ミニラン between the swim rank and bike lap — a
// short, low-variance (~3min) connecting jog from the swim exit to T1 at
// this venue (盃湖 lake to 上の台ゲレンデ transition), modeled as a swim
// transition (T1-equivalent) rather than a competitive run leg: no rank
// column exists for it and its duration doesn't scale with athlete pace.
// This year also has no 年齢 (age) column, same as 2025.
import { readFileSync, writeFileSync } from "node:fs";

const path = "race-info.json";
const data = JSON.parse(readFileSync(path, "utf8"));

const ev = data.events.find((e) => e.id === "yamagata_zao");
if (!ev) {
  console.error("MISSING EVENT yamagata_zao");
  process.exit(1);
}
if (ev.editions.some((e) => e.date === "2026-08-29")) {
  console.error("ALREADY has 2026-08-29 edition");
  process.exit(1);
}

const standard = {
  id: "yamagata_zao",
  result_tsv: "master/2026/yamagata_zao/default.tsv",
  name: "スタンダードディスタンス",
  distance: "OD",
  description: "2026年おもてなし山形トライアスロンin ZAO。山形市蔵王温泉を舞台に、スイム1.5km、バイク40km、ラン10kmのスタンダードディスタンスで開催。",
  segments: [
    {
      sport: "swim",
      distance: 1.5,
      columns: [
        { header: "スイムラップ", role: "lap" },
        { header: "S順", role: "rank" },
        { header: "ミニラン", role: "transition" },
      ],
    },
    {
      sport: "bike",
      distance: 40,
      columns: [
        { header: "バイクラップ", role: "lap" },
        { header: "B順", role: "rank" },
        { header: "スプリット", role: "cumulative_time" },
        { header: "通過", role: "cumulative_rank" },
      ],
    },
    {
      sport: "run",
      distance: 10,
      columns: [
        { header: "ランラップ", role: "lap" },
        { header: "R順", role: "rank" },
      ],
    },
  ],
  meta_columns: [
    { header: "総合順位", role: "overall_rank" },
    { header: "No.", role: "bib" },
    { header: "氏名", role: "name" },
    { header: "性別", role: "gender" },
    { header: "都道府県", role: "residence" },
    { header: "総合記録", role: "total_time" },
    { header: "男子順位", role: "gender_rank" },
    { header: "女子順位", role: "gender_rank" },
    { header: "区分", role: "age_category" },
    { header: "区分順位", role: "age_rank" },
  ],
  source_url: "https://results.jtu.or.jp/api/results?cond[result_table_id]=4588",
};

const sprint = {
  id: "yamagata_zao_sprint",
  result_tsv: "master/2026/yamagata_zao/sprint.tsv",
  name: "スプリントディスタンス",
  distance: "SD",
  description: "2026年おもてなし山形トライアスロンin ZAO スプリントディスタンス。山形市蔵王温泉を舞台に、スイム750m、バイク20km、ラン5kmで開催。",
  segments: [
    {
      sport: "swim",
      distance: 0.75,
      columns: [
        { header: "スイムラップ", role: "lap" },
        { header: "S順", role: "rank" },
        { header: "ミニラン", role: "transition" },
      ],
    },
    {
      sport: "bike",
      distance: 20,
      columns: [
        { header: "バイクラップ", role: "lap" },
        { header: "B順", role: "rank" },
        { header: "スプリット", role: "cumulative_time" },
        { header: "通過", role: "cumulative_rank" },
      ],
    },
    {
      sport: "run",
      distance: 5,
      columns: [
        { header: "ランラップ", role: "lap" },
        { header: "R順", role: "rank" },
      ],
    },
  ],
  meta_columns: [
    { header: "総合順位", role: "overall_rank" },
    { header: "No.", role: "bib" },
    { header: "氏名", role: "name" },
    { header: "性別", role: "gender" },
    { header: "都道府県", role: "residence" },
    { header: "総合記録", role: "total_time" },
    { header: "男子順位", role: "gender_rank" },
    { header: "女子順位", role: "gender_rank" },
    { header: "区分", role: "age_category" },
    { header: "区分順位", role: "age_rank" },
  ],
  source_url: "https://results.jtu.or.jp/api/results?cond[result_table_id]=4589",
};

const edition = {
  date: "2026-08-29",
  weather_file: "master/2026/yamagata_zao/weather-data.json",
  categories: [standard, sprint],
};

const newestFirst = ev.editions[0].date >= ev.editions[ev.editions.length - 1].date;
if (newestFirst) ev.editions.unshift(edition);
else ev.editions.push(edition);

writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
console.log("Added yamagata_zao 2026-08-29 edition (standard + sprint).");
