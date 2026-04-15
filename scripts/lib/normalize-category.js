import { buildAthlete } from "./build-athlete.js";
import { parseTsv } from "./parse-tsv.js";

/**
 * Normalize a TSV content string using a category definition from race-info.json.
 *
 * @param {string} tsvContent - Raw TSV file content
 * @param {{ meta_columns: Array, segments: Array, result_tsv: string }} categoryDef
 * @returns {{ athletes: Object[], warnings: string[] }}
 */
export function normalizeCategory(tsvContent, categoryDef) {
  const warnings = [];
  const { headers, rows } = parseTsv(tsvContent);

  // Validate that all mapped headers exist in TSV
  const allMappedHeaders = [
    ...categoryDef.meta_columns.map((mc) => mc.header),
    ...categoryDef.segments.flatMap((seg) =>
      seg.columns.map((col) => col.header),
    ),
  ];
  for (const h of allMappedHeaders) {
    if (!headers.includes(h)) {
      warnings.push(
        `Header mismatch in ${categoryDef.result_tsv}: column "${h}" not found in TSV headers`,
      );
    }
  }

  const athletes = rows
    .map((row) =>
      buildAthlete(row, categoryDef.meta_columns, categoryDef.segments),
    )
    .filter((a) => a.name !== "");

  return { athletes, warnings };
}
