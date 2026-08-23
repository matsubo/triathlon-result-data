// Add two brand-new 2026 JTU age-group events found by the 2026-08-24
// /import-race discovery run: Tsugaru Jomon Triathlon (event_id 418) and
// Utsukushima Triathlon in Iwaki (event_id 420). Both raced 2026-08-23.
import { readFileSync, writeFileSync } from "node:fs";

const path = "race-info.json";
const data = JSON.parse(readFileSync(path, "utf8"));

const tsugaru = {
  id: "tsugaru_jomon",
  name: "つがる縄文トライアスロン大会",
  location: "青森県つがる市",
  location_parts: {
    country: "JP",
    prefecture: "青森県",
    city: "つがる市",
  },
  image: "images/tsugaru_jomon.webp",
  source: "https://jomontri.com/",
  editions: [
    {
      date: "2026-08-23",
      weather_file: "master/2026/tsugaru_jomon/weather-data.json",
      categories: [
        {
          id: "tsugaru_jomon",
          result_tsv: "master/2026/tsugaru_jomon/default.tsv",
          name: "個人部門",
          distance: "OD",
          description: "第2回つがる縄文トライアスロン大会（2026）。青森県つがる市車力マグアビーチ公園。スイム1.5km、バイク40km、ラン10km。",
          segments: [
            {
              sport: "swim",
              distance: 1.5,
              columns: [
                { header: "ｽｲﾑﾗｯﾌﾟ", role: "lap" },
                { header: "Ｓ順", role: "rank" },
              ],
            },
            {
              sport: "bike",
              distance: 40,
              columns: [
                { header: "ﾊﾞｲｸﾗｯﾌﾟ", role: "lap" },
                { header: "Ｂ順", role: "rank" },
                { header: "ｽﾌﾟﾘｯﾄ", role: "cumulative_time" },
                { header: "通過", role: "cumulative_rank" },
              ],
            },
            {
              sport: "run",
              distance: 10,
              columns: [
                { header: "ﾗﾝﾗｯﾌﾟ", role: "lap" },
                { header: "Ｒ順", role: "rank" },
              ],
            },
          ],
          meta_columns: [
            { header: "総合順位", role: "overall_rank" },
            { header: "No.", role: "bib" },
            { header: "氏名", role: "name" },
            { header: "年齢", role: "age" },
            { header: "性別", role: "gender" },
            { header: "居住地", role: "residence" },
            { header: "総合記録", role: "total_time" },
            { header: "男子順位", role: "gender_rank" },
            { header: "女子順位", role: "gender_rank" },
            { header: "区分", role: "age_category" },
            { header: "区分順位", role: "age_rank" },
            { header: "選手権順", role: "championship_rank" },
          ],
          source_url: "https://results.jtu.or.jp/api/results?cond[result_table_id]=4584",
        },
      ],
    },
  ],
};

const iwaki = {
  id: "utsukushima_iwaki",
  name: "うつくしまトライアスロンinいわき",
  location: "福島県いわき市小名浜",
  location_parts: {
    country: "JP",
    prefecture: "福島県",
    city: "いわき市",
  },
  image: "images/utsukushima_iwaki.webp",
  source: "https://fksmtri.jimdofree.com/",
  editions: [
    {
      date: "2026-08-23",
      weather_file: "master/2026/utsukushima_iwaki/weather-data.json",
      categories: [
        {
          id: "utsukushima_iwaki",
          result_tsv: "master/2026/utsukushima_iwaki/default.tsv",
          name: "エイジ",
          distance: "OD",
          description: "第1回うつくしまトライアスロンinいわき（2026）。福島県いわき市小名浜第2・第3ふ頭周辺。スイム1.5km、バイク40km、ラン10km。",
          segments: [
            {
              sport: "swim",
              distance: 1.5,
              columns: [
                { header: "ｽｲﾑﾗｯﾌﾟ", role: "lap" },
                { header: "Ｓ順", role: "rank" },
                { header: "T1", role: "transition" },
              ],
            },
            {
              sport: "bike",
              distance: 40,
              columns: [
                { header: "ﾊﾞｲｸﾗｯﾌﾟ", role: "lap" },
                { header: "Ｂ順", role: "rank" },
                { header: "ｽﾌﾟﾘｯﾄ", role: "cumulative_time" },
                { header: "通過", role: "cumulative_rank" },
                { header: "T2", role: "transition" },
              ],
            },
            {
              sport: "run",
              distance: 10,
              columns: [
                { header: "ﾗﾝﾗｯﾌﾟ", role: "lap" },
                { header: "Ｒ順", role: "rank" },
              ],
            },
          ],
          meta_columns: [
            { header: "総合順位", role: "overall_rank" },
            { header: "No.", role: "bib" },
            { header: "氏名", role: "name" },
            { header: "年齢", role: "age" },
            { header: "性別", role: "gender" },
            { header: "都道府県", role: "residence" },
            { header: "総合記録", role: "total_time" },
            { header: "男子順位", role: "gender_rank" },
            { header: "女子順位", role: "gender_rank" },
            { header: "年齢区分", role: "age_category" },
            { header: "年齡別順", role: "age_rank" },
            { header: "東北順位", role: "note" },
            { header: "福島順位", role: "note" },
          ],
          source_url: "https://results.jtu.or.jp/api/results?cond[result_table_id]=4582",
        },
      ],
    },
  ],
};

for (const ev of [tsugaru, iwaki]) {
  if (data.events.some((e) => e.id === ev.id)) {
    console.error(`ALREADY EXISTS: ${ev.id}`);
    process.exit(1);
  }
}

data.events.push(tsugaru);
data.events.push(iwaki);

writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
console.log("Added tsugaru_jomon and utsukushima_iwaki events.");
