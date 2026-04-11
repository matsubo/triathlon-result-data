/**
 * Fix Overall_Rank in TSV files where all ranks are 99999.
 * Assigns correct ranks based on Total_Time sort order.
 * DNS/DNF/DQ athletes get no rank (empty).
 *
 * Usage: bun run scripts/fix-overall-rank.js
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

// Find all affected TSV files
const files = execSync(
  `find master -name "default.tsv" | while read f; do
    count_99999=$(awk -F'\\t' 'NR>1 && $2=="99999" {c++} END {print c+0}' "$f")
    total=$(awk 'END{print NR-1}' "$f")
    if [ "$count_99999" = "$total" ] && [ "$total" -gt 0 ]; then
      echo "$f"
    fi
  done`,
  { encoding: "utf-8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);

console.log(`🔧 Fixing Overall_Rank in ${files.length} TSV files...\n`);

function parseTime(timeStr) {
  if (!timeStr || timeStr.trim() === "") return null;
  const parts = timeStr.trim().split(":");
  if (parts.length !== 3) return null;
  const [h, m, s] = parts.map(Number);
  if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(s)) return null;
  return h * 3600 + m * 60 + s;
}

let totalFixed = 0;

for (const file of files) {
  const content = readFileSync(file, "utf-8");
  const lines = content.trim().split("\n");
  const header = lines[0];
  const rows = lines.slice(1).map((line) => line.split("\t"));

  // Column indices
  const headers = header.split("\t");
  const rankIdx = headers.indexOf("Overall_Rank");
  const timeIdx = headers.indexOf("Total_Time");
  const statusIdx = headers.indexOf("Status");
  const divRankIdx = headers.indexOf("Div_Rank");

  if (rankIdx === -1 || timeIdx === -1) {
    console.log(`  ⚠️  ${file}: missing columns`);
    continue;
  }

  // Separate finishers from non-finishers
  const finishers = [];
  const nonFinishers = [];

  for (const row of rows) {
    const totalTime = parseTime(row[timeIdx]);
    const status = (row[statusIdx] || "").trim().toUpperCase();
    const isNonFinisher =
      !totalTime ||
      status === "DNS" ||
      status === "DNF" ||
      status === "DQ" ||
      status === "DSQ";

    if (isNonFinisher) {
      nonFinishers.push(row);
    } else {
      finishers.push({ row, seconds: totalTime });
    }
  }

  // Sort finishers by time
  finishers.sort((a, b) => a.seconds - b.seconds);

  // Assign ranks
  for (let i = 0; i < finishers.length; i++) {
    finishers[i].row[rankIdx] = String(i + 1);
  }

  // Non-finishers get empty rank
  for (const row of nonFinishers) {
    row[rankIdx] = "";
    // Also fix Div_Rank if it's 99999
    if (divRankIdx !== -1 && row[divRankIdx] === "99999") {
      row[divRankIdx] = "";
    }
  }

  // Rebuild TSV: finishers first (sorted), then non-finishers
  const allRows = [
    ...finishers.map((f) => f.row),
    ...nonFinishers,
  ];
  const newContent = `${[header, ...allRows.map((r) => r.join("\t"))].join("\n")}\n`;

  writeFileSync(file, newContent);
  totalFixed++;
  console.log(
    `  ✅ ${file}: ${finishers.length} ranked, ${nonFinishers.length} non-finishers`,
  );
}

console.log(`\n📦 Fixed ${totalFixed} files`);
