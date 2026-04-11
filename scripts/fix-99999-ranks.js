/**
 * Replace 99999 in Overall_Rank and Div_Rank with empty string for non-finishers.
 * These are DNS/DNF/DQ athletes where the API returned 99999 instead of null.
 *
 * Usage: bun run scripts/fix-99999-ranks.js
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const files = execSync('find master -name "default.tsv" -exec grep -l "99999" {} \\;', {
  encoding: "utf-8",
})
  .trim()
  .split("\n")
  .filter(Boolean);

console.log(`🔧 Fixing 99999 ranks in ${files.length} TSV files...\n`);

let totalFixed = 0;
let totalReplacements = 0;

for (const file of files) {
  const content = readFileSync(file, "utf-8");
  const lines = content.trim().split("\n");
  const header = lines[0];
  const headers = header.split("\t");
  const rankIdx = headers.indexOf("Overall_Rank");
  const divRankIdx = headers.indexOf("Div_Rank");

  let replacements = 0;
  const newLines = [header];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    if (rankIdx !== -1 && cols[rankIdx] === "99999") {
      cols[rankIdx] = "";
      replacements++;
    }
    if (divRankIdx !== -1 && cols[divRankIdx] === "99999") {
      cols[divRankIdx] = "";
    }
    newLines.push(cols.join("\t"));
  }

  if (replacements > 0) {
    writeFileSync(file, `${newLines.join("\n")}\n`);
    totalFixed++;
    totalReplacements += replacements;
  }
}

console.log(`📦 Fixed ${totalFixed} files, ${totalReplacements} total replacements`);
