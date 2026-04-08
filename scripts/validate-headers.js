/**
 * Validate that all column headers in race-info.json exist in corresponding TSV files.
 * Exit code 1 if any mismatches are found.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const raceInfo = JSON.parse(
  readFileSync(join(repoRoot, "race-info.json"), "utf-8"),
);

function parseTsvHeaders(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const firstLine = content.split("\n").find((l) => l.trim() !== "");
  if (!firstLine) return [];
  return firstLine.split("\t").map((h) => h.trim());
}

const mismatches = [];

for (const event of raceInfo.events) {
  for (const edition of event.editions) {
    for (const category of edition.categories) {
      const tsvPath = join(repoRoot, category.result_tsv);
      if (!existsSync(tsvPath)) continue;

      const headers = parseTsvHeaders(tsvPath);
      const mappedHeaders = [
        ...category.meta_columns.map((mc) => mc.header),
        ...category.segments.flatMap((seg) =>
          seg.columns.map((col) => col.header),
        ),
      ];

      for (const h of mappedHeaders) {
        if (!headers.includes(h)) {
          mismatches.push(
            `${category.result_tsv}: column "${h}" not found in TSV headers`,
          );
        }
      }
    }
  }
}

if (mismatches.length > 0) {
  console.error(`❌ ${mismatches.length} header mismatch(es) found:\n`);
  for (const m of mismatches) {
    console.error(`  - ${m}`);
  }
  process.exit(1);
} else {
  console.log("✅ All mapped headers match TSV files.");
}
