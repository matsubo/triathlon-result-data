import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const raceInfoPath = join(__dirname, "..", "race-info.json");

const content = readFileSync(raceInfoPath, "utf-8");
const data = JSON.parse(content);

// Common non-sport columns to exclude
const metaColumns = new Set([
  "#",
  "No.",
  "氏名",
  "年齢",
  "性別",
  "居住地",
  "スタート",
  "総合記録",
  "FINISH",
  "備考",
  "ステータス",
  "男子順位",
  "女子順位",
  "年齢区分",
  "年齢別順",
  "年代区分",
  "年代順位",
  "総合順位",
]);

// Patterns to classify columns into segments
const swimPatterns = [/スイム/i, /swim/i, /^S順$/];
const bikePatterns = [/バイク/i, /bike/i, /^B順$/];
const runPatterns = [/ラン/i, /run/i, /^R順$/, /^R折/, /^R\d/];
// Transition / split columns
const transitionPatterns = [/^T\d$/, /スプリット/, /通過/];

// Duathlon first-run patterns
const firstRunPatterns = [/^1st.*ラン/i, /^1R順$/];
const secondRunPatterns = [/^2nd.*ラン/i, /^2R順$/];

function classifyColumn(col, segments) {
  // For duathlon with two run segments, handle 1st/2nd run
  const hasTwoRuns = segments.filter((s) => s.sport === "run").length >= 2;

  if (hasTwoRuns) {
    if (firstRunPatterns.some((p) => p.test(col))) return "run1";
    if (secondRunPatterns.some((p) => p.test(col))) return "run2";
  }

  if (swimPatterns.some((p) => p.test(col))) return "swim";
  if (bikePatterns.some((p) => p.test(col))) return "bike";
  if (runPatterns.some((p) => p.test(col))) return "run";
  if (transitionPatterns.some((p) => p.test(col))) return "transition";

  return null;
}

let updated = 0;
let skipped = 0;

const migratedEvents = data.events.map((event) => ({
  ...event,
  editions: event.editions.map((edition) => ({
    ...edition,
    categories: edition.categories.map((category) => {
      const tsvPath = join(__dirname, "..", category.result_tsv);
      let headers;
      try {
        const tsvContent = readFileSync(tsvPath, "utf-8");
        const firstLine = tsvContent.split("\n")[0];
        headers = firstLine.split("\t").map((h) => h.trim());
      } catch {
        console.log(`  SKIP (no TSV): ${category.result_tsv}`);
        skipped++;
        return category;
      }

      // Filter to sport-related columns only
      const sportColumns = headers.filter((h) => !metaColumns.has(h) && h);

      if (sportColumns.length === 0) {
        console.log(`  SKIP (no sport columns): ${category.id}`);
        skipped++;
        return category;
      }

      // Build column groups per segment
      // Track which run index we're on for multi-run segments
      const runSegIndex = 0;
      const segmentColumns = category.segments.map(() => []);

      // Map sport types to segment indices
      const sportToSegIndices = {};
      for (let i = 0; i < category.segments.length; i++) {
        const sport = category.segments[i].sport;
        if (!sportToSegIndices[sport]) sportToSegIndices[sport] = [];
        sportToSegIndices[sport].push(i);
      }

      // Track current segment context for sequential assignment
      let currentSegIdx = 0;

      for (const col of sportColumns) {
        const classification = classifyColumn(col, category.segments);

        if (classification === "transition") {
          // Assign transition columns to the previous segment
          if (currentSegIdx > 0) {
            segmentColumns[currentSegIdx - 1].push(col);
          }
          continue;
        }

        if (classification === "run1") {
          const runIndices = sportToSegIndices["run"] || [];
          if (runIndices.length >= 1) {
            segmentColumns[runIndices[0]].push(col);
            currentSegIdx = runIndices[0] + 1;
          }
          continue;
        }

        if (classification === "run2") {
          const runIndices = sportToSegIndices["run"] || [];
          if (runIndices.length >= 2) {
            segmentColumns[runIndices[1]].push(col);
            currentSegIdx = runIndices[1] + 1;
          }
          continue;
        }

        if (classification) {
          // Find the correct segment index for this sport
          const indices = sportToSegIndices[classification] || [];
          if (indices.length === 1) {
            segmentColumns[indices[0]].push(col);
            currentSegIdx = indices[0] + 1;
          } else if (indices.length > 1) {
            // Multiple segments of same sport - use sequential logic
            // Find first segment at or after currentSegIdx
            const idx =
              indices.find((i) => i >= currentSegIdx) ||
              indices[indices.length - 1];
            segmentColumns[idx].push(col);
            currentSegIdx = idx + 1;
          }
        }
      }

      const newSegments = category.segments.map((seg, i) => {
        if (segmentColumns[i].length > 0) {
          return { ...seg, columns: segmentColumns[i] };
        }
        return seg;
      });

      updated++;
      const summary = newSegments
        .map((s) => `${s.sport}(${(s.columns || []).length}cols)`)
        .join(", ");
      console.log(`  UPDATED: ${category.id} -> ${summary}`);

      return { ...category, segments: newSegments };
    }),
  })),
}));

const result = { events: migratedEvents };
writeFileSync(raceInfoPath, `${JSON.stringify(result, null, 2)}\n`);

console.log(`\nUpdated: ${updated}, Skipped: ${skipped}`);
console.log("Done. Run 'bun run check' to format.");
