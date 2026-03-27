/**
 * Parse time string "H:MM:SS" or "HH:MM:SS" to total seconds.
 * @param {string|null|undefined} str
 * @returns {number|null}
 */
export function parseTime(str) {
  if (!str || typeof str !== "string") return null;
  const trimmed = str.trim();
  if (trimmed === "") return null;

  const parts = trimmed.split(":");
  if (parts.length !== 3) return null;

  const [h, m, s] = parts.map(Number);
  if ([h, m, s].some(Number.isNaN)) return null;
  if (m < 0 || m > 59 || s < 0 || s > 59) return null;

  return h * 3600 + m * 60 + s;
}
