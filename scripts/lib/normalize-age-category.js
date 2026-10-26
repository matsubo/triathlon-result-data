/**
 * Age category labels: parse a raw 年齢区分 value into an age bracket, and
 * name its canonical label.
 *
 * The canonical label is the IRONMAN-style label ai-tri renders
 * (`formatAgeGroupLabel`): a gender letter followed by the bracket.
 *
 *   男子25-29歳 / 25-29歳男子 / 30-34男子 / 男子40才～44才 → M25-29 / M30-34 / M40-44
 *   女子24歳以下 / 19歳以下女子 / U20女子                    → F0-24 / F0-19 / F0-20
 *   男子65歳以上 / 70代以上男子 / 60-  男子                  → M65+ / M70+ / M60+
 *   30歳代男子 / 男子40代                                    → M30-39 / M40-49
 *
 * Only labels that carry a Japanese gender word (男 / 女) are in scope: that
 * is what makes the same bracket render differently across events. Labels
 * that name a division rather than an age bracket (一般男子, 高校生男子, …)
 * have no canonical form.
 *
 * @typedef {{ min_age: number, max_age: number }} AgeBracket
 * @typedef {"canonical" | "fixable" | "no-canonical-form" | "out-of-scope"} AgeLabelClass
 */

/**
 * Parse age category string into {min_age, max_age} or null.
 * Handles 30+ format variations from race results.
 * Brackets outside 0–99 are rejected: they come from a rank glued onto the
 * label during extraction (e.g. "1030歳～39歳女子" = rank 10 + "30歳～39歳女子").
 * @param {string|null|undefined} str
 * @returns {AgeBracket|null}
 */
export function parseAgeCategory(str) {
  const bracket = parseBracket(str);
  if (!bracket || bracket.min_age < 0 || bracket.max_age > 99) return null;
  return bracket;
}

/**
 * Canonical label for a raw 年齢区分 value, or null when the value carries no
 * Japanese gender word (or both), is not an age bracket, or parses to an
 * implausible bracket (OCR garbage such as "230歳〜39歳女子"). A returned
 * label always parses back to the same bracket as the raw value.
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function canonicalAgeCategory(raw) {
  const label = (raw || "").trim();
  const gender = genderOfLabel(label);
  if (gender !== "M" && gender !== "F") return null;
  const bracket = parseAgeCategory(label);
  if (!bracket || bracket.min_age > bracket.max_age) return null;
  const canonical = formatLabel(gender, bracket);
  return sameBracket(parseAgeCategory(canonical), bracket) ? canonical : null;
}

/**
 * Where a raw 年齢区分 value stands against the canonical notation:
 * - "canonical": already a canonical label (M25-29, F0-24, M65+)
 * - "fixable": carries a Japanese gender word and has a canonical form
 *   (see canonicalAgeCategory)
 * - "no-canonical-form": carries a Japanese gender word but names no usable
 *   age bracket (division labels, labels naming both genders, OCR garbage)
 * - "out-of-scope": neither canonical nor carrying a Japanese gender word
 * @param {string|null|undefined} raw
 * @returns {AgeLabelClass}
 */
export function classifyAgeCategory(raw) {
  const label = (raw || "").trim();
  const letter = label.match(/^([MF])\d/)?.[1];
  const bracket = letter ? parseAgeCategory(label) : null;
  if (bracket && formatLabel(letter, bracket) === label) return "canonical";
  if (!genderOfLabel(label)) return "out-of-scope";
  return canonicalAgeCategory(label) ? "fixable" : "no-canonical-form";
}

/**
 * Japanese gender word (男 / 女) in a label → "M" | "F", "both" when it names
 * both genders, null when it names neither.
 * @param {string} label
 * @returns {"M" | "F" | "both" | null}
 */
function genderOfLabel(label) {
  const male = label.includes("男");
  const female = label.includes("女");
  if (male && female) return "both";
  if (male) return "M";
  return female ? "F" : null;
}

/**
 * Canonical label for a gender letter and a bracket.
 * @param {string} gender
 * @param {AgeBracket} bracket
 */
function formatLabel(gender, { min_age, max_age }) {
  if (max_age >= 99) return `${gender}${min_age}+`;
  return `${gender}${min_age}-${max_age}`;
}

/**
 * @param {AgeBracket|null} a
 * @param {AgeBracket} b
 */
function sameBracket(a, b) {
  return a?.min_age === b.min_age && a?.max_age === b.max_age;
}

function parseBracket(str) {
  if (!str || typeof str !== "string") return null;
  let s = str
    .trim()
    .replace(/[～〜]/g, "-")
    .replace(/\s+/g, "-");
  if (s === "") return null;

  // Non-age categories → null
  if (/^PRO|^プロ|^PC\/ID$|^Guide|^PT$|^HC$|^ブル/i.test(s)) return null;

  // Pure numbers that are likely rank values (not age categories) → null
  // Age categories as bare numbers are only decades (20,30,...,90)
  if (/^\d+$/.test(s)) {
    const num = Number.parseInt(s, 10);
    if (num % 10 === 0 && num >= 10 && num <= 90) {
      return { min_age: num, max_age: num + 9 };
    }
    return null;
  }

  // Fix common OCR typos before parsing
  s = s
    .replace(/^go/i, "50") // go → 50
    .replace(/^zo/i, "70") // zo → 70
    .replace(/(\d)o/g, "$10") // 7o → 70 (OCR: o→0)
    .replace(/^低/i, "50") // 低 → 50 (OCR of 50)
    .replace(/^杏/i, "40") // 杏 → 40 (OCR of 40)
    .replace(/^\$-?/i, "3") // $ → 3 (OCR of 3)
    .replace(/^作-?/i, "40"); // 作 → 40 (OCR of 40)

  // "U20男子" → {0, 20}
  const uMatch = s.match(/^U(\d+)/i);
  if (uMatch) {
    return { min_age: 0, max_age: Number.parseInt(uMatch[1], 10) };
  }

  // "19才以下女子", "29歳以下男子", "24以下男子", "24際以下" (typo), "24～以下"
  const underMatch = s.match(/(\d+)[歳才際]?-?以下/);
  if (underMatch) {
    return { min_age: 0, max_age: Number.parseInt(underMatch[1], 10) };
  }

  // "30歳未満男子", "男子25才未満", "30未満女子" — strictly below n
  const belowMatch = s.match(/(\d+)[歳才]?未満/);
  if (belowMatch) {
    return { min_age: 0, max_age: Number.parseInt(belowMatch[1], 10) - 1 };
  }

  // "-19M", "-19F", "-19男子", "N-19", "F-19", "M-19", "男子～24才"
  const dashUnderMatch = s.match(/^(?:[MFNWmfnw]|男子|女子)?-(\d+)/);
  if (dashUnderMatch) {
    return { min_age: 0, max_age: Number.parseInt(dashUnderMatch[1], 10) };
  }

  // "70以上男子", "70歳以上男子", "70代以上男子", "N80-", "M70+", "F70&+", "M70 y +"
  const overMatch = s.match(/(\d+)[歳才代]?以上/);
  if (overMatch) {
    return { min_age: Number.parseInt(overMatch[1], 10), max_age: 99 };
  }
  const plusMatch = s.match(/^[MFNWmfnw]?(\d+)[-y&]*\+/);
  if (plusMatch) {
    return { min_age: Number.parseInt(plusMatch[1], 10), max_age: 99 };
  }
  const dashOverMatch = s.match(/^[MFNWmfnw]?(\d+)-$/);
  if (dashOverMatch) {
    return { min_age: Number.parseInt(dashOverMatch[1], 10), max_age: 99 };
  }
  // "60-  男子" (open-ended bracket followed by the gender word)
  const dashOverGenderMatch = s.match(/^(\d+)-+[男女]/);
  if (dashOverGenderMatch) {
    return {
      min_age: Number.parseInt(dashOverGenderMatch[1], 10),
      max_age: 99,
    };
  }

  // "80---M" (spaces already replaced with -)
  const looseDecadeMatch = s.match(/^(\d{2})-+[MFmf]$/);
  if (looseDecadeMatch) {
    const base = Number.parseInt(looseDecadeMatch[1], 10);
    if (base % 10 === 0) return { min_age: base, max_age: base + 9 };
  }

  // "1970年代男子" is a birth decade, not an age bracket.
  if (/\d{4}年代/.test(s)) return null;

  // "10.20代男子" / "10・20代" spans two decades
  const twoDecadeMatch = s.match(/(\d+)[.・](\d+)[歳]?代/);
  if (twoDecadeMatch) {
    return {
      min_age: Number.parseInt(twoDecadeMatch[1], 10),
      max_age: Number.parseInt(twoDecadeMatch[2], 10) + 9,
    };
  }

  // "50歳代男子" or "50代男子" or "10代男子"
  const decadeMatch = s.match(/(\d+)[歳]?代/);
  if (decadeMatch) {
    const base = Number.parseInt(decadeMatch[1], 10);
    return { min_age: base, max_age: base + 9 };
  }

  // Range with hyphen: "50-54歳", "M50-54", "男子40才～44才", "20歳～29歳男子"
  const rangeMatch = s.match(/(\d+)[歳才]?-(\d+)/);
  if (rangeMatch) {
    let min = Number.parseInt(rangeMatch[1], 10);
    let max = Number.parseInt(rangeMatch[2], 10);
    if (min > max) [min, max] = [max, min];
    return { min_age: min, max_age: max };
  }

  // 4-digit concatenated range without hyphen: "2529男子", "6560男子"
  const concatMatch = s.match(/^[MFNWmfnw]?(\d{2})(\d{2})/);
  if (concatMatch) {
    let min = Number.parseInt(concatMatch[1], 10);
    let max = Number.parseInt(concatMatch[2], 10);
    if (min > max) [min, max] = [max, min];
    if (min >= 10 && max <= 99) return { min_age: min, max_age: max };
  }

  // Bare decade with prefix/suffix: "M40", "40M", "N50", "50F"
  const bareMatch = s.match(/^[MFNWmfnw]?(\d{2})[MFmf男女]?/);
  if (bareMatch) {
    const base = Number.parseInt(bareMatch[1], 10);
    if (base % 10 === 0 && base >= 10 && base <= 90) {
      return { min_age: base, max_age: base + 9 };
    }
  }

  return null;
}
