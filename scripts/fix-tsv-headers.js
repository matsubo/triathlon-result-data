import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const masterDir = join(__dirname, "..", "master");

// Header replacements: [pattern, replacement]
const replacements = [
  // Typos
  ["S川", "S順"],
  ["B川順", "B順"],
  ["RJ順", "R順"],
  ["日順", "B順"],
  // Full-width to half-width
  ["Ｓ順", "S順"],
  ["Ｂ順", "B順"],
  ["Ｒ順", "R順"],
  // Half-width katakana to full-width
  ["ｽﾌﾟﾘｯﾄ", "スプリット"],
  // Lowercase
  ["s順", "S順"],
  // Kanji variant (齡→齢)
  ["年齡", "年齢"],
  // Space in header
  ["年代 順位", "年代順位"],
  // Normalize ranking column names (full name → abbreviated)
  ["スイム順位", "S順"],
  ["バイク順位", "B順"],
  ["ラン順位", "R順"],
  // Normalize gender rank variations
  ["男女別順", "男子順位"],
  // Normalize penalty variations
  ["PNL\t", "ペナルティ\t"],
  ["PNLT\t", "ペナルティ\t"],
  ["PNLT", "ペナルティ"],
  ["PNL", "ペナルティ"],
  // Normalize No without period
  ["\tNo\t", "\tNo.\t"],
  // Normalize # to 総合順位 (miyakojima)
  ["#\t", "総合順位\t"],
];

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
let fixedFiles = 0;

for (const file of files) {
  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n");
  let header = lines[0];
  let changed = false;

  for (const [pattern, replacement] of replacements) {
    if (header.includes(pattern)) {
      header = header.replaceAll(pattern, replacement);
      changed = true;
    }
  }

  if (changed) {
    lines[0] = header;
    writeFileSync(file, lines.join("\n"));
    const relPath = file.replace(join(__dirname, "..") + "/", "");
    console.log(`FIXED: ${relPath}`);
    fixedFiles++;
  }
}

console.log(`\nFixed ${fixedFiles} files out of ${files.length} total.`);
