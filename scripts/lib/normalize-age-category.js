/**
 * Parse age category string into {min_age, max_age} or null.
 * Handles 20+ format variations.
 * @param {string|null|undefined} str
 * @returns {{ min_age: number, max_age: number }|null}
 */
export function parseAgeCategory(str) {
  if (!str || typeof str !== "string") return null;
  const s = str.trim().replace(/～/g, "-").replace(/\s+/g, "-");
  if (s === "") return null;

  // PRO category
  if (/^PRO/i.test(s)) return null;

  // "29歳以下" or "29歳以下男子"
  const underMatch = s.match(/(\d+)歳以下/);
  if (underMatch) {
    return { min_age: 0, max_age: Number.parseInt(underMatch[1], 10) };
  }

  // "70歳以上" or "70歳以上男子"
  const overMatch = s.match(/(\d+)歳以上/);
  if (overMatch) {
    return { min_age: Number.parseInt(overMatch[1], 10), max_age: 99 };
  }

  // "50歳代男子" or "50代男子" or "10代男子"
  const decadeMatch = s.match(/(\d+)歳?代/);
  if (decadeMatch) {
    const base = Number.parseInt(decadeMatch[1], 10);
    return { min_age: base, max_age: base + 9 };
  }

  // Range patterns: extract two numbers
  // "50-54歳", "50-54歳男子", "50-59男子", "M50-54", "N50-54",
  // "50-54M", "50-54F", "男子40-49歳", "女子30-39歳",
  // "18-24男子", "25-39男子", "60-69女子"
  const rangeMatch = s.match(/(\d+)-(\d+)/);
  if (rangeMatch) {
    let min = Number.parseInt(rangeMatch[1], 10);
    let max = Number.parseInt(rangeMatch[2], 10);
    if (min > max) [min, max] = [max, min];
    return { min_age: min, max_age: max };
  }

  // Bare decade: "40", "50", "60" etc (1-2 digit number alone or with gender suffix)
  const bareMatch = s.match(/^[MFNWmfnw]?(\d{2})(?:[MFmf男女].*)?$/);
  if (bareMatch) {
    const base = Number.parseInt(bareMatch[1], 10);
    if (base % 10 === 0 && base >= 10 && base <= 90) {
      return { min_age: base, max_age: base + 9 };
    }
  }

  return null;
}
