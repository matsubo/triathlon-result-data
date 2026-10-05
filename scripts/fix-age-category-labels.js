/**
 * Rewrite 年齢区分 cells that carry a Japanese gender word into the canonical
 * label (scripts/lib/canonical-age-category.js): 男子25-29歳 → M25-29,
 * 女子24歳以下 → F0-24, 男子65歳以上 → M65+.
 *
 * Only columns mapped to role `age_category` in race-info.json are touched,
 * and every rewrite is checked to parse to the same bracket as the original.
 * A cell whose row has an age (role `age`) outside the bracket by more than a
 * year is left as-is: that label is corrupt (OCR such as "46 44男子" on a
 * 42-year-old), and a clean-looking canonical label would hide it.
 * Values with no canonical form (divisions such as 一般男子, OCR garbage) are
 * left alone too; tests/tsv-lint.test.ts reports them against
 * age-category-allowlist.json and tsv-lint-known-issues.json.
 *
 * Idempotent. Run after importing any TSV:
 *   bun run scripts/fix-age-category-labels.js
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalAgeCategory } from "./lib/canonical-age-category.js";
import { parseAgeCategory } from "./lib/normalize-age-category.js";

const repoRoot = join(import.meta.dirname, "..");
const data = JSON.parse(readFileSync(join(repoRoot, "race-info.json"), "utf8"));

// tsv path -> { headers: age_category headers, age: age header | null }
const targets = new Map();
for (const ev of data.events)
  for (const ed of ev.editions)
    for (const c of ed.categories) {
      const metas = c.meta_columns || [];
      const ageHeader = metas.find((m) => m.role === "age")?.header ?? null;
      for (const m of metas)
        if (m.role === "age_category") {
          if (!targets.has(c.result_tsv))
            targets.set(c.result_tsv, { headers: new Set(), age: ageHeader });
          targets.get(c.result_tsv).headers.add(m.header);
        }
    }

let files = 0;
let cells = 0;
let skipped = 0;
for (const [tsv, { headers, age }] of targets) {
  let text;
  try {
    text = readFileSync(join(repoRoot, tsv), "utf8");
  } catch {
    continue;
  }
  const lines = text.split("\n");
  const head = lines[0].split("\t");
  const idxs = head
    .map((h, i) => (headers.has(h) ? i : -1))
    .filter((i) => i >= 0);
  const ageIdx = age ? head.indexOf(age) : -1;
  let changed = 0;
  for (let ln = 1; ln < lines.length; ln++) {
    if (!lines[ln]) continue;
    const cr = lines[ln].endsWith("\r");
    const row = (cr ? lines[ln].slice(0, -1) : lines[ln]).split("\t");
    let rowChanged = false;
    for (const i of idxs) {
      const raw = row[i];
      if (raw === undefined) continue;
      const canon = canonicalAgeCategory(raw);
      if (!canon || canon === raw) continue;
      const bracket = parseAgeCategory(canon);
      if (JSON.stringify(bracket) !== JSON.stringify(parseAgeCategory(raw))) {
        throw new Error(
          `${tsv}:${ln + 1}: ${raw} -> ${canon} changes the parsed bracket`,
        );
      }
      const athleteAge =
        ageIdx >= 0 ? Number.parseInt(row[ageIdx], 10) : Number.NaN;
      if (
        athleteAge > 0 &&
        (athleteAge < bracket.min_age - 1 || athleteAge > bracket.max_age + 1)
      ) {
        skipped++;
        continue;
      }
      row[i] = canon;
      rowChanged = true;
      changed++;
    }
    if (rowChanged) lines[ln] = row.join("\t") + (cr ? "\r" : "");
  }
  if (changed) {
    writeFileSync(join(repoRoot, tsv), lines.join("\n"));
    files++;
    cells += changed;
  }
}
console.log(
  `Rewrote ${cells} 年齢区分 cells in ${files} files; left ${skipped} whose bracket contradicts the athlete's age.`,
);
