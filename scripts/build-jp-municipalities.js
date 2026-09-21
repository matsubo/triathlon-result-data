#!/usr/bin/env bun
/**
 * Regenerate scripts/lib/data/jp-municipalities.json.
 *
 * Result sources spell a Japanese 居住地 / 登録地 in whatever granularity the
 * organiser felt like: some events print the prefecture, some print the
 * municipality for local entrants (小松鉄人レース prints 金沢市 / 河北郡 for
 * 石川県 residents and the prefecture for everyone else). parseResidence needs a
 * municipality → prefecture table to normalise both.
 *
 * Source: https://geolonia.github.io/japanese-addresses (MIT). Its ja.json is a
 * 都道府県 → 市区町村 index where 郡 and 政令市 are written as one string
 * ("河北郡津幡町", "広島市中区").
 *
 * Every name a result sheet might print is registered as a key: the full entry,
 * the 郡 on its own, the 町/村 on its own, the 政令市 on its own, and the ward on
 * its own. A key kept only when it belongs to exactly one prefecture — that is
 * what drops 府中市 (東京/広島), 伊達市 (北海道/福島) and the shared ward names
 * (中央区, 北区, 港区 …), which must stay unresolved rather than guess.
 *
 * Deterministic: re-running without an upstream change produces no diff.
 *
 * Usage: bun run scripts/build-jp-municipalities.js
 */
import { writeFileSync } from "node:fs";

const SOURCE = "https://geolonia.github.io/japanese-addresses/api/ja.json";
const OUT = new URL("./lib/data/jp-municipalities.json", import.meta.url);

// ISO 3166-2:JP, in code order
const PREFECTURE_CODES = {
  北海道: "JP-01",
  青森県: "JP-02",
  岩手県: "JP-03",
  宮城県: "JP-04",
  秋田県: "JP-05",
  山形県: "JP-06",
  福島県: "JP-07",
  茨城県: "JP-08",
  栃木県: "JP-09",
  群馬県: "JP-10",
  埼玉県: "JP-11",
  千葉県: "JP-12",
  東京都: "JP-13",
  神奈川県: "JP-14",
  新潟県: "JP-15",
  富山県: "JP-16",
  石川県: "JP-17",
  福井県: "JP-18",
  山梨県: "JP-19",
  長野県: "JP-20",
  岐阜県: "JP-21",
  静岡県: "JP-22",
  愛知県: "JP-23",
  三重県: "JP-24",
  滋賀県: "JP-25",
  京都府: "JP-26",
  大阪府: "JP-27",
  兵庫県: "JP-28",
  奈良県: "JP-29",
  和歌山県: "JP-30",
  鳥取県: "JP-31",
  島根県: "JP-32",
  岡山県: "JP-33",
  広島県: "JP-34",
  山口県: "JP-35",
  徳島県: "JP-36",
  香川県: "JP-37",
  愛媛県: "JP-38",
  高知県: "JP-39",
  福岡県: "JP-40",
  佐賀県: "JP-41",
  長崎県: "JP-42",
  熊本県: "JP-43",
  大分県: "JP-44",
  宮崎県: "JP-45",
  鹿児島県: "JP-46",
  沖縄県: "JP-47",
};

/** Every name the entry could legitimately be printed as. */
function keysFor(entry) {
  const gun = entry.match(/^(.+?郡)(.+[町村])$/);
  if (gun) return [entry, gun[1], gun[2]];
  const ward = entry.match(/^(.+?市)(.+区)$/);
  if (ward) return [entry, ward[1], ward[2]];
  return [entry];
}

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`${SOURCE} → HTTP ${res.status}`);
/** @type {Record<string, string[]>} */
const index = await res.json();

const owners = new Map(); // key → Set of prefecture codes
for (const [prefecture, entries] of Object.entries(index)) {
  const code = PREFECTURE_CODES[prefecture];
  if (!code) throw new Error(`unknown prefecture in source: ${prefecture}`);
  for (const entry of entries) {
    for (const key of keysFor(entry)) {
      if (!owners.has(key)) owners.set(key, new Set());
      owners.get(key).add(code);
    }
  }
}

const unique = {};
const ambiguous = [];
for (const key of [...owners.keys()].sort()) {
  const codes = owners.get(key);
  if (codes.size === 1) unique[key] = [...codes][0];
  else ambiguous.push(key);
}

writeFileSync(OUT, `${JSON.stringify(unique, null, 2)}\n`);
console.log(
  `wrote ${OUT.pathname}: ${Object.keys(unique).length} unambiguous names, ` +
    `${ambiguous.length} dropped as ambiguous (${ambiguous.slice(0, 8).join(", ")}…)`,
);
