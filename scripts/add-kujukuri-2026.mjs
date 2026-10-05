// Add the 九十九里トライアスロン (kujukuri) 2026 edition, raced 2026-10-03 at
// 一宮海岸. TSVs come from scripts/import-kujukuri-99t.py (kanji 氏名, kana in
// フリガナ). Distances: MD 1.9 / 90.1 / 20.1 — the run was shortened by 1 km
// because of course flooding (organiser news post of 2026-10-03) — and
// スタンダード 1.5 / 40 / 10.
import { readFileSync, writeFileSync } from "node:fs";

const DATE = "2026-10-03";

const segments = (swim, bike, run) => [
  {
    sport: "swim",
    distance: swim,
    columns: [
      { header: "スイムラップ", role: "lap" },
      { header: "S順", role: "rank" },
      { header: "T1ラップ", role: "transition" },
    ],
  },
  {
    sport: "bike",
    distance: bike,
    columns: [
      { header: "バイクラップ", role: "lap" },
      { header: "B順", role: "rank" },
      { header: "スプリット", role: "cumulative_time" },
      { header: "通過", role: "cumulative_rank" },
      { header: "T2ラップ", role: "transition" },
    ],
  },
  {
    sport: "run",
    distance: run,
    columns: [
      { header: "ランラップ", role: "lap" },
      { header: "R順", role: "rank" },
    ],
  },
];

const meta = [
  { header: "総合順位", role: "overall_rank" },
  { header: "No.", role: "bib" },
  { header: "氏名", role: "name" },
  { header: "フリガナ", role: "note" },
  { header: "年齢", role: "age" },
  { header: "性別", role: "gender" },
  { header: "総合記録", role: "total_time" },
  { header: "男女別順位", role: "gender_rank" },
  { header: "年代区分", role: "age_category" },
  { header: "年代順位", role: "age_rank" },
];

const edition = {
  date: DATE,
  weather_file: "master/2026/kujukuri/weather-data.json",
  categories: [
    {
      id: "kujukuri_md",
      result_tsv: "master/2026/kujukuri/md.tsv",
      name: "ミドルディスタンス",
      distance: "MD",
      description:
        "2026年 ミドルディスタンス。一宮海岸周辺で開催。コース冠水のためランが1km短縮され、スイム1.9km・バイク90.1km・ラン20.1kmで実施。",
      segments: segments(1.9, 90.1, 20.1),
      meta_columns: meta,
      source_url: null,
    },
    {
      id: "kujukuri_od",
      result_tsv: "master/2026/kujukuri/od.tsv",
      name: "スタンダードディスタンス",
      distance: "OD",
      description: "2026年 スタンダードディスタンス。一宮海岸周辺で開催。スイム1.5km、バイク40km、ラン10km。",
      segments: segments(1.5, 40, 10),
      meta_columns: meta,
      source_url: null,
    },
  ],
};

const data = JSON.parse(readFileSync("race-info.json", "utf8"));
const ev = data.events.find((e) => e.id === "kujukuri");
if (!ev) throw new Error("NO EVENT kujukuri");
if (ev.editions.some((e) => e.date === DATE)) throw new Error(`ALREADY has ${DATE}`);
// The kujukuri editions are newest-first (with the 2020 duathlon appended last).
ev.editions.unshift(edition);
writeFileSync("race-info.json", `${JSON.stringify(data, null, 2)}\n`);
console.log("added kujukuri 2026");
