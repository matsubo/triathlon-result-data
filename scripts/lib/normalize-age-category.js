/**
 * Parse age category string into {min_age, max_age} or null.
 * Handles 30+ format variations from race results.
 * Brackets outside 0–99 are rejected: they come from a rank glued onto the
 * label during extraction (e.g. "1030歳～39歳女子" = rank 10 + "30歳～39歳女子").
 * @param {string|null|undefined} str
 * @returns {{ min_age: number, max_age: number }|null}
 */
export function parseAgeCategory(str) {
  const bracket = parseBracket(str);
  if (!bracket || bracket.min_age < 0 || bracket.max_age > 99) return null;
  return bracket;
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
