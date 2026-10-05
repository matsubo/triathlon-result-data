import { parseAgeCategory } from "./normalize-age-category.js";

/**
 * Canonical 年齢区分 notation for TSV age_category columns: the IRONMAN-style
 * label ai-tri renders (`formatAgeGroupLabel`), i.e. a gender letter followed
 * by the age bracket.
 *
 *   男子25-29歳 / 25-29歳男子 / 30-34男子 / 男子40才～44才 → M25-29 / M30-34 / M40-44
 *   女子24歳以下 / 19歳以下女子 / U20女子                    → F0-24 / F0-19 / F0-20
 *   男子65歳以上 / 70代以上男子 / 60-  男子                  → M65+ / M70+ / M60+
 *   30歳代男子 / 男子40代                                    → M30-39 / M40-49
 *
 * Only labels that carry a Japanese gender word (男 / 女) are in scope: that
 * is what makes the same bracket render differently across events. Labels
 * that name a division rather than an age bracket (一般男子, 高校生男子, …)
 * have no canonical form and are listed in age-category-allowlist.json.
 */

/** Japanese gender word in a label → "M" | "F" | null (none or both). */
export function genderOfAgeLabel(label) {
  const male = label.includes("男");
  const female = label.includes("女");
  if (male === female) return null;
  return male ? "M" : "F";
}

/** Format a parsed bracket as the canonical label. */
export function formatAgeCategory(gender, { min_age, max_age }) {
  if (max_age >= 99) return `${gender}${min_age}+`;
  return `${gender}${min_age}-${max_age}`;
}

/**
 * Canonical label for a raw 年齢区分 value, or null when the value has no
 * Japanese gender word, is not an age bracket, or parses to an implausible
 * bracket (OCR garbage such as "230歳〜39歳女子").
 * @param {string} raw
 * @returns {string|null}
 */
export function canonicalAgeCategory(raw) {
  const label = (raw || "").trim();
  const gender = genderOfAgeLabel(label);
  if (!gender) return null;
  const bracket = parseAgeCategory(label);
  if (!bracket) return null;
  const { min_age, max_age } = bracket;
  if (!(min_age >= 0 && min_age <= max_age && max_age <= 99)) return null;
  return formatAgeCategory(gender, bracket);
}
