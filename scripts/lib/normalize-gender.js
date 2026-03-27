/**
 * Normalize gender value.
 * @param {string|null|undefined} str
 * @returns {"M"|"F"|null}
 */
export function parseGender(str) {
  if (!str || typeof str !== "string") return null;
  const trimmed = str.trim();
  if (trimmed === "男") return "M";
  if (trimmed === "女") return "F";
  return null;
}
