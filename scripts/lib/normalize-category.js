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

  // Rows without a name (continuation lines of a wrapped note) are not
  // Athletes, so their rank cell text raises no warning.
  const athletes = [];
  for (const row of rows) {
    let unknownToken = null;
    const athlete = buildAthlete(
      row,
      categoryDef.meta_columns,
      categoryDef.segments,
      (token) => {
        unknownToken = token;
      },
    );
    if (athlete.name === "") continue;
    athletes.push(athlete);
    if (unknownToken !== null) {
      warnings.push(
        `Unknown status token "${unknownToken}" in ${categoryDef.result_tsv}`,
      );
    }
  }

  return { athletes, warnings };
}
