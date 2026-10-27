/**
 * Rewrite 年齢区分 cells that carry a Japanese gender word into the canonical
 * label (scripts/lib/normalize-age-category.js): 男子25-29歳 → M25-29,
 * 女子24歳以下 → F0-24, 男子65歳以上 → M65+.
 *
 * Only cells of Column role `age_category` are touched (read through the
 * Category reader, rewritten with rewriteCells so every other byte stays);
 * a canonical label always parses to the same bracket as the original.
 * A cell whose row has an age (role `age`) outside the bracket by more than a
 * year is left as-is (relabelAgeCategory): that label is corrupt.
 * Values with no canonical form (divisions such as 一般男子, OCR garbage) are
 * left alone too; tests/tsv-lint.test.ts reports them against
 * age-category-allowlist.json and tsv-lint-known-issues.json.
 *
 * Idempotent. Run after importing any TSV:
 *   bun run scripts/fix-age-category-labels.js
 */
import { join } from "node:path";
import { readCategories, rewriteCells } from "./lib/category-reader.js";
import { relabelAgeCategory } from "./lib/normalize-age-category.js";
import { fsRepo } from "./lib/repo.js";

const repo = fsRepo(join(import.meta.dirname, ".."));

let files = 0;
let cells = 0;
let skipped = 0;
for (const category of readCategories(repo).categories) {
  let changed = 0;
  const text = rewriteCells(category, "age_category", (value, row) => {
    const { label, contradictsAge } = relabelAgeCategory(value, row.get("age"));
    if (contradictsAge) skipped++;
    if (label === null) return undefined;
    changed++;
    return label;
  });
  if (text === null) continue;
  repo.writeText(category.tsv, text);
  files++;
  cells += changed;
}
console.log(
  `Rewrote ${cells} 年齢区分 cells in ${files} files; left ${skipped} whose bracket contradicts the athlete's age.`,
);
