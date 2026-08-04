// Add two standalone duathlon events discovered by the 2026-08-03 /import-race run:
// higashiogishima_duathlon (CalfMan Signature in 東扇島, Kawasaki) and
// nagaragawa_duathlon (CalfMan Signature 長良川デュアスロン, Kaizu). Both are
// run-bike-run (5km/30km/5km) age-group duathlons, previously out of scope
// (repo had zero standalone duathlon events) — user-approved for this run.
import { readFileSync, writeFileSync } from "node:fs";

const path = "race-info.json";
const data = JSON.parse(readFileSync(path, "utf8"));

const runBikeRun = (col1, col2) => [
  { sport: "run", distance: 5, columns: [
    { header: col1[0], role: "lap" },
    { header: col1[1], role: "rank" },
  ]},
  { sport: "bike", distance: 30, columns: [
    { header: "ﾊﾞｲｸﾗｯﾌﾟ", role: "lap" },
    { header: "Ｂ順", role: "rank" },
    { header: "ｽﾌﾟﾘｯﾄ", role: "cumulative_time" },
    { header: "通過", role: "cumulative_rank" },
  ]},
  { sport: "run", distance: 5, columns: [
    { header: col2[0], role: "lap" },
    { header: col2[1], role: "rank" },
  ]},
];

if (!data.events.find((e) => e.id === "higashiogishima_duathlon")) {
  data.events.unshift({
    id: "higashiogishima_duathlon",
    name: "カーフマン・シグネーチャーデュアスロン in 東扇島",
    location: "神奈川県川崎市 東扇島東公園",
    location_parts: { country: "JP", prefecture: "神奈川県", city: "川崎市" },
    image: "images/higashiogishima_duathlon.webp",
    source: "https://www.jtu.or.jp/event/65836/",
    editions: [
      {
        date: "2026-02-15",
        weather_file: "master/2026/higashiogishima_duathlon/weather-data.json",
        categories: [
          {
            id: "higashiogishima_duathlon_age",
            result_tsv: "master/2026/higashiogishima_duathlon/age.tsv",
            name: "エイジクラス",
            distance: "DUATHLON",
            description: "2026年 第3回カーフマン・シグネーチャーデュアスロンin東扇島 エイジクラス。神奈川県川崎市の東扇島特設コースで、ラン5km、バイク30km、ラン5kmの構成で開催。日本学生デュアスロン選手権・トライアスロンジャパン関東ブロックデュアスロン選手権併催。",
            segments: runBikeRun(["1ﾗﾝﾗｯﾌﾟ", "1R順"], ["2ﾗﾝﾗｯﾌﾟ", "2R順"]),
            meta_columns: [
              { header: "総合順位", role: "overall_rank" },
              { header: "No.", role: "bib" },
              { header: "氏名", role: "name" },
              { header: "年齢", role: "age" },
              { header: "性別", role: "gender" },
              { header: "総合記録", role: "total_time" },
              { header: "男子順位", role: "gender_rank" },
              { header: "女子順位", role: "gender_rank" },
              { header: "年齡別順位", role: "age_rank" },
            ],
            source_url: "https://results.jtu.or.jp/api/results?cond[result_table_id]=3964",
          },
          {
            id: "higashiogishima_duathlon_citizen",
            result_tsv: "master/2026/higashiogishima_duathlon/citizen.tsv",
            name: "シチズンクラス",
            distance: "DUATHLON",
            description: "2026年 第3回カーフマン・シグネーチャーデュアスロンin東扇島 シチズンクラス。神奈川県川崎市の東扇島特設コースで、ラン5km、バイク30km、ラン5kmの構成で開催。",
            segments: runBikeRun(["1ﾗﾝﾗｯﾌﾟ", "1R順"], ["2ﾗﾝﾗｯﾌﾟ", "2R順"]),
            meta_columns: [
              { header: "総合順位", role: "overall_rank" },
              { header: "No.", role: "bib" },
              { header: "氏名", role: "name" },
              { header: "年齢", role: "age" },
              { header: "性別", role: "gender" },
              { header: "総合記録", role: "total_time" },
              { header: "男子順位", role: "gender_rank" },
              { header: "女子順位", role: "gender_rank" },
            ],
            source_url: "https://results.jtu.or.jp/api/results?cond[result_table_id]=3965",
          },
        ],
      },
      {
        date: "2025-02-16",
        weather_file: "master/2025/higashiogishima_duathlon/weather-data.json",
        categories: [
          {
            id: "higashiogishima_duathlon_age",
            result_tsv: "master/2025/higashiogishima_duathlon/age.tsv",
            name: "エイジクラス",
            distance: "DUATHLON",
            description: "2025年 第2回カーフマン・シグネーチャーデュアスロンin東扇島 エイジクラス。神奈川県川崎市の東扇島特設コースで、ラン5km、バイク30km、ラン5kmの構成で開催。日本学生デュアスロン選手権・JTU関東ブロックデュアスロン選手権併催。",
            segments: runBikeRun(["1ﾗﾝﾗｯﾌﾟ", "1R順"], ["2ﾗﾝﾗｯﾌﾟ", "2R順"]),
            meta_columns: [
              { header: "総合順位", role: "overall_rank" },
              { header: "No.", role: "bib" },
              { header: "氏名", role: "name" },
              { header: "年齢", role: "age" },
              { header: "性別", role: "gender" },
              { header: "総合記録", role: "total_time" },
              { header: "男子順位", role: "gender_rank" },
              { header: "女子順位", role: "gender_rank" },
              { header: "年齡別順", role: "age_rank" },
            ],
            source_url: "https://results.jtu.or.jp/api/results?cond[result_table_id]=2997",
          },
          {
            id: "higashiogishima_duathlon_citizen",
            result_tsv: "master/2025/higashiogishima_duathlon/citizen.tsv",
            name: "シチズンクラス",
            distance: "DUATHLON",
            description: "2025年 第2回カーフマン・シグネーチャーデュアスロンin東扇島 シチズンクラス。神奈川県川崎市の東扇島特設コースで、ラン5km、バイク30km、ラン5kmの構成で開催。",
            segments: runBikeRun(["1ﾗﾝﾗｯﾌﾟ", "1R順"], ["2ﾗﾝﾗｯﾌﾟ", "2R順"]),
            meta_columns: [
              { header: "総合順位", role: "overall_rank" },
              { header: "No.", role: "bib" },
              { header: "氏名", role: "name" },
              { header: "年齢", role: "age" },
              { header: "性別", role: "gender" },
              { header: "総合記録", role: "total_time" },
              { header: "男子順位", role: "gender_rank" },
              { header: "女子順位", role: "gender_rank" },
            ],
            source_url: "https://results.jtu.or.jp/api/results?cond[result_table_id]=2998",
          },
        ],
      },
    ],
  });
  console.log("added higashiogishima_duathlon event");
}

if (!data.events.find((e) => e.id === "nagaragawa_duathlon")) {
  data.events.unshift({
    id: "nagaragawa_duathlon",
    name: "CalfMan Signature 長良川デュアスロン",
    location: "岐阜県海津市 木曽三川公園",
    location_parts: { country: "JP", prefecture: "岐阜県", city: "海津市" },
    image: "images/nagaragawa_duathlon.webp",
    source: "https://gifu-triathlon.jp/event/2025/01/b958bd1e8007ef7bc4ef3c022842a9de44e46a29.html",
    editions: [
      {
        date: "2025-11-23",
        weather_file: "master/2025/nagaragawa_duathlon/weather-data.json",
        categories: [
          {
            id: "nagaragawa_duathlon",
            result_tsv: "master/2025/nagaragawa_duathlon/age.tsv",
            name: "エイジ",
            distance: "DUATHLON",
            description: "2025年 CalfMan Signature 第3回長良川デュアスロン エイジクラス。岐阜県海津市の国営木曽三川公園アクアフィールド特設コースで、ラン5km、バイク30km、ラン5kmの構成で開催。日本デュアスロン選手権併催。",
            segments: runBikeRun(["1st ﾗﾝﾗｯﾌﾟ", "1st順"], ["2nd ﾗﾝﾗｯﾌﾟ", "2nd順"]),
            meta_columns: [
              { header: "総合順位", role: "overall_rank" },
              { header: "No.", role: "bib" },
              { header: "氏名", role: "name" },
              { header: "年齢", role: "age" },
              { header: "性別", role: "gender" },
              { header: "登録地", role: "residence" },
              { header: "総合記録", role: "total_time" },
              { header: "PNLT", role: "penalty" },
              { header: "男子順位", role: "gender_rank" },
              { header: "女子順位", role: "gender_rank" },
              { header: "年齢区分", role: "age_category" },
              { header: "年齡別順", role: "age_rank" },
            ],
            source_url: "https://results.jtu.or.jp/api/results?cond[result_table_id]=3872",
          },
        ],
      },
    ],
  });
  console.log("added nagaragawa_duathlon event");
}

writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
console.log("done");
