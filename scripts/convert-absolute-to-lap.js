import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse time string "H:MM:SS" to total seconds
function parseTime(str) {
  if (!str || str.trim() === "") return null;
  const parts = str.trim().split(":");
  if (parts.length !== 3) return null;
  const [h, m, s] = parts.map(Number);
  if ([h, m, s].some(Number.isNaN)) return null;
  return h * 3600 + m * 60 + s;
}

// Format seconds back to "H:MM:SS"
function formatTime(seconds) {
  if (seconds === null) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Files to convert (all absolute-time miyakojima files)
const files = [
  "master/2016/miyakojima/result.tsv",
  "master/2017/miyakojima/result.tsv",
  "master/2018/miyakojima/result.tsv",
  "master/2019/miyakojima/result.tsv",
  "master/2023/miyakojima/result.tsv",
  "master/2024/miyakojima/result.tsv",
  "master/2025/miyakojima/result.tsv",
];

// Columns to keep as-is (not time data)
const metaHeaders = new Set([
  "#",
  "No.",
  "氏名",
  "年齢",
  "性別",
  "居住地",
  "備考",
  "ステータス",
]);

for (const relPath of files) {
  const filePath = join(__dirname, "..", relPath);
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const headers = lines[0].split("\t");

  // Find the "スタート" column index
  const startIdx = headers.indexOf("スタート");
  if (startIdx === -1) {
    console.log(`SKIP (no スタート column): ${relPath}`);
    continue;
  }

  // Identify time columns: everything after スタート except meta columns, 総合記録, FINISH
  // We'll convert all absolute time columns to lap times (diff from previous)
  const timeColIndices = [];
  for (let i = startIdx + 1; i < headers.length; i++) {
    const h = headers[i].trim();
    if (metaHeaders.has(h) || h === "総合記録" || h === "") continue;
    timeColIndices.push(i);
  }

  // Remove スタート column, keep 総合記録 as-is
  const newHeaders = headers.filter((_, i) => i !== startIdx);

  // Rename time columns to indicate they are now lap-based
  // But keep original names since they describe checkpoints

  const newLines = [newHeaders.join("\t")];
  let converted = 0;

  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (line.trim() === "") {
      newLines.push(line);
      continue;
    }

    const cols = line.split("\t");
    const startTime = parseTime(cols[startIdx]);

    if (startTime === null) {
      // No valid start time, keep as-is but remove start column
      const newCols = cols.filter((_, i) => i !== startIdx);
      newLines.push(newCols.join("\t"));
      continue;
    }

    // Convert absolute times to lap times (diff from previous checkpoint)
    let prevTime = startTime;
    const newCols = [...cols];

    for (const colIdx of timeColIndices) {
      const absTime = parseTime(cols[colIdx]);
      if (absTime === null) {
        // Empty or invalid - leave as-is
        continue;
      }
      const lapTime = absTime - prevTime;
      newCols[colIdx] = formatTime(lapTime >= 0 ? lapTime : 0);
      prevTime = absTime;
    }

    // Remove start column
    const finalCols = newCols.filter((_, i) => i !== startIdx);
    newLines.push(finalCols.join("\t"));
    converted++;
  }

  writeFileSync(filePath, newLines.join("\n"));
  console.log(
    `CONVERTED: ${relPath} (${converted} rows, ${timeColIndices.length} time columns)`,
  );
}

console.log("\nDone.");
