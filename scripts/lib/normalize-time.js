const TIME_PATTERN = /^(\d{1,3}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?(?=\s|$)/;

/**
 * Parse a time string to total seconds.
 *
 * Accepts "H:MM:SS" / "HH:MM:SS" / "MM:SS", each with an optional
 * fractional-seconds suffix (e.g. "25:55.68", used by chip-timing systems),
 * and tolerates a trailing flag token after the time (e.g. "2:39:42 P",
 * a penalty marker some organizers append to the finish time).
 *
 * @param {string|null|undefined} str
 * @returns {number|null}
 */
export function parseTime(str) {
  if (!str || typeof str !== "string") return null;
  const trimmed = str.trim();
  if (trimmed === "") return null;

  const match = trimmed.match(TIME_PATTERN);
  if (!match) return null;

  const [, first, second, third, fraction] = match;
  const hasHours = third !== undefined;
  const h = hasHours ? Number(first) : 0;
  const m = hasHours ? Number(second) : Number(first);
  const s = Number(hasHours ? third : second);
  if (m < 0 || m > 59 || s < 0 || s > 59) return null;

  const fractionalSeconds = fraction ? Number(`0.${fraction}`) : 0;
  return Math.round(h * 3600 + m * 60 + s + fractionalSeconds);
}
