/**
 * Parse integer from string, stripping commas.
 * @param {string} str
 * @returns {number|null}
 */
export function parseInteger(str) {
  if (!str || typeof str !== "string" || str.trim() === "") return null;
  const cleaned = str.trim().replace(/,/g, "");
  const num = Number.parseInt(cleaned, 10);
  return Number.isNaN(num) ? null : num;
}
