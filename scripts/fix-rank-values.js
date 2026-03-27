import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const masterDir = join(__dirname, "..", "master");

function findTsvFiles(dir) {
  const files = [];
  function traverse(d) {
    for (const item of readdirSync(d)) {
      const full = join(d, item);
      if (statSync(full).isDirectory()) traverse(full);
      else if (item === "result.tsv") files.push(full);
    }
  }
  traverse(dir);
  return files.sort();
}

const files = findTsvFiles(masterDir);
let totalFixed = 0;

for (const file of files) {
  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n");
  const headers = lines[0].split("\t");

  const rankIdx = headers.indexOf("総合順位");
  if (rankIdx === -1) continue;

  let fileFixed = 0;

  const newLines = lines.map((line, lineIdx) => {
    if (lineIdx === 0 || line.trim() === "") return line;

    const cols = line.split("\t");
    const rank = cols[rankIdx];
    let newRank = rank;

    // psQ → DSQ
    if (rank === "psQ") {
      newRank = "DSQ";
    }
    // DQ → DSQ
    else if (rank === "DQ") {
      newRank = "DSQ";
    }
    // DNE → DNS
    else if (rank === "DNE") {
      newRank = "DNS";
    }
    // 99,999 → DNS
    else if (rank === "99,999") {
      newRank = "DNS";
    }
    // xxxS pattern (e.g., "100S") → strip S
    else if (/^[0-9]+S$/.test(rank)) {
      newRank = rank.slice(0, -1);
    }
    // Comma-formatted numbers (e.g., "1,234") → strip commas
    else if (/^[0-9]+,[0-9]+$/.test(rank)) {
      newRank = rank.replace(/,/g, "");
    }

    if (newRank !== rank) {
      cols[rankIdx] = newRank;
      fileFixed++;
      return cols.join("\t");
    }
    return line;
  });

  if (fileFixed > 0) {
    writeFileSync(file, newLines.join("\n"));
    const relPath = file.replace(`${join(__dirname, "..")}/`, "");
    console.log(`FIXED: ${relPath} (${fileFixed} values)`);
    totalFixed += fileFixed;
  }
}

console.log(
  `\nTotal fixed: ${totalFixed} values across ${files.length} files.`,
);
