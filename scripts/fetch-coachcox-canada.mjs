/**
 * Fetch Ironman Canada results (all editions) from CoachCox JSON API
 * and write TSV files to master/<year>/ironman_canada_<year>/default.tsv
 *
 * Usage: node scripts/fetch-coachcox-canada.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const RACES = [
  { id: "ironman_canada_2012", year: 2012, coachcox: 1947, date: "2012-08-26", location: "Penticton, BC, Canada" },
  { id: "ironman_canada_2013", year: 2013, coachcox: 217,  date: "2013-08-25", location: "Whistler, BC, Canada" },
  { id: "ironman_canada_2014", year: 2014, coachcox: 244,  date: "2014-07-27", location: "Whistler, BC, Canada" },
  { id: "ironman_canada_2015", year: 2015, coachcox: 291,  date: "2015-07-26", location: "Whistler, BC, Canada" },
  { id: "ironman_canada_2016", year: 2016, coachcox: 336,  date: "2016-07-24", location: "Whistler, BC, Canada" },
  { id: "ironman_canada_2017", year: 2017, coachcox: 385,  date: "2017-07-30", location: "Whistler, BC, Canada" },
  { id: "ironman_canada_2018", year: 2018, coachcox: 439,  date: "2018-07-29", location: "Whistler, BC, Canada" },
  { id: "ironman_canada_2019", year: 2019, coachcox: 488,  date: "2019-07-28", location: "Penticton, BC, Canada" },
  { id: "ironman_canada_2022", year: 2022, coachcox: 1774, date: "2022-08-28", location: "Penticton, BC, Canada" },
  { id: "ironman_canada_2024", year: 2024, coachcox: 2149, date: "2024-08-25", location: "Penticton, BC, Canada" },
];

function sec2hms(s) {
  if (s === null || s === undefined || s === "" || s === "0") return "";
  const n = Number.parseInt(s, 10);
  if (Number.isNaN(n) || n <= 0) return "";
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const ss = n % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function convertName(n) {
  if (!n) return "";
  const parts = n.split(",");
  if (parts.length !== 2) return n.trim();
  const last = parts[0].trim();
  const first = parts[1].trim();
  return `${first} ${last}`;
}

function convertGender(g) {
  if (g === "Male") return "M";
  if (g === "Female") return "F";
  return "";
}

const STATUS_ALIASES = { DQ: "DSQ" };

function convertRank(row) {
  const fs = (row.fs || "").trim();
  if (fs && fs !== "Finished" && fs !== "FIN") {
    return STATUS_ALIASES[fs] || fs;
  }
  return row.or ?? "";
}

async function fetchRace(race) {
  const url = `https://www.coachcox.co.uk/wp-json/imstats/v1.90/race/results/${race.coachcox}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (triathlon-result-data importer)",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function buildTsv(rows) {
  const header = [
    "ContactId",
    "Overall_Rank",
    "Name",
    "Gender",
    "Division",
    "Div_Rank",
    "Total_Time",
    "Swim",
    "T1",
    "Bike",
    "T2",
    "Run",
    "Country",
    "Status",
  ];
  const lines = [header.join("\t")];
  for (const r of rows) {
    lines.push(
      [
        r.aid || "",
        convertRank(r),
        convertName(r.n),
        convertGender(r.g),
        r.di || "",
        r.odr ?? "",
        sec2hms(r.ot),
        sec2hms(r.st),
        sec2hms(r.t1t),
        sec2hms(r.bt),
        sec2hms(r.t2t),
        sec2hms(r.rt),
        r.c || "",
        r.fs || "",
      ].join("\t"),
    );
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  let total = 0;
  for (const race of RACES) {
    try {
      const rows = await fetchRace(race);
      if (!Array.isArray(rows)) {
        console.error(`❌ ${race.id}: unexpected response shape`);
        continue;
      }
      const tsv = buildTsv(rows);
      const dir = join(repoRoot, "master", String(race.year), race.id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "default.tsv"), tsv);
      console.log(`✅ ${race.id}: ${rows.length} rows`);
      total += rows.length;
    } catch (err) {
      console.error(`❌ ${race.id}: ${err.message}`);
    }
  }
  console.log(`\nTotal: ${total} rows across ${RACES.length} races`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
