// Rebuild master/2026/fujihill/result.tsv from official runnet results (race 383993).
// Policy (user-chosen "keep age groups, replace times only"):
//   - Keep enriched Division / Gender / Name from current TSV.
//   - Overwrite Gross_Time, Total_Time(net), and all splits from official data.
//   - Recompute Overall_Rank (global) and Div_Rank (within Division) by NET time.
//   - NET ties broken by bib ascending; athletes without a net time ranked last (by gross, bib).
//   - Drop bibs absent from the official result (e.g. bib 1536, which had corrupt provisional splits).
import { readFileSync, writeFileSync } from "node:fs";

const OFFICIAL = "/tmp/fujihill2026-official.json";
const TSV = "master/2026/fujihill/result.tsv";
const HEADER = [
  "BibNumber", "Name", "Division", "Gender", "Gross_Time", "Total_Time",
  "Div_Rank", "Overall_Rank", "Lap_19km", "Split_19km", "Lap_20km",
  "Split_20km", "Lap_Finish",
];

const toSec = (t) => {
  if (!t) return null;
  const p = t.split(":").map(Number);
  return p[0] * 3600 + p[1] * 60 + p[2];
};
const hms = (sec) => {
  if (sec == null) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};
const hmsPad = (t) => {
  const sec = toSec(t);
  if (sec == null) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

// --- load official, keyed by bib (finish-row athletes only) ---
const official = JSON.parse(readFileSync(OFFICIAL, "utf8"));
const off = new Map();
for (const arr of Object.values(official)) {
  for (const a of arr) {
    if (a.finish_gross || a.finish_net) off.set(a.bib, a);
  }
}

// --- load current TSV (for Division / Gender / Name enrichment + bib order) ---
const lines = readFileSync(TSV, "utf8").trimEnd().split("\n");
const curHeader = lines[0].split("\t");
const idx = Object.fromEntries(curHeader.map((h, i) => [h, i]));
const current = lines.slice(1).map((l) => l.split("\t"));

// --- assemble rows in current bib order, dropping bibs absent from official ---
const dropped = [];
const rows = [];
for (const c of current) {
  const bib = c[idx.BibNumber];
  const o = off.get(bib);
  if (!o) { dropped.push(bib); continue; }

  const k19n = o.k19_net || "";
  const k20n = o.k20_net || "";
  const fn = o.finish_net || "";
  const lap19 = k19n ? hms(toSec(k19n)) : "";
  const split19 = o.k19_gross ? hmsPad(o.k19_gross) : "";
  const lap20 = (k19n && k20n) ? hms(toSec(k20n) - toSec(k19n)) : "";
  const split20 = o.k20_gross ? hmsPad(o.k20_gross) : "";
  const lapFin = (fn && k20n) ? hms(toSec(fn) - toSec(k20n)) : "";

  rows.push({
    BibNumber: bib,
    Name: c[idx.Name] || o.name,
    Division: c[idx.Division],
    Gender: c[idx.Gender] || o.gender,
    Gross_Time: o.finish_gross || "",
    Total_Time: fn,
    Div_Rank: "",       // filled below
    Overall_Rank: "",   // filled below
    Lap_19km: lap19,
    Split_19km: split19,
    Lap_20km: lap20,
    Split_20km: split20,
    Lap_Finish: lapFin,
  });
}

// --- ranking by NET time (ties -> bib asc; empty-net last by gross, bib) ---
const rankKey = (r) => {
  const net = toSec(r.Total_Time);
  const gross = toSec(r.Gross_Time);
  const bib = Number(r.BibNumber);
  return net == null
    ? [1, gross ?? Infinity, bib]
    : [0, net, bib];
};
const cmp = (a, b) => {
  const ka = rankKey(a), kb = rankKey(b);
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
  return 0;
};

// global overall rank
[...rows].sort(cmp).forEach((r, i) => { r.Overall_Rank = String(i + 1); });

// division rank
const byDiv = new Map();
for (const r of rows) {
  if (!byDiv.has(r.Division)) byDiv.set(r.Division, []);
  byDiv.get(r.Division).push(r);
}
for (const list of byDiv.values()) {
  list.sort(cmp).forEach((r, i) => { r.Div_Rank = String(i + 1); });
}

// --- write TSV (current bib order preserved) ---
const out = [HEADER.join("\t"), ...rows.map((r) => HEADER.map((h) => r[h]).join("\t"))].join("\n") + "\n";
writeFileSync(TSV, out);
process.stderr.write(`wrote ${rows.length} rows; dropped ${dropped.length} bib(s): ${dropped.join(", ")}\n`);
