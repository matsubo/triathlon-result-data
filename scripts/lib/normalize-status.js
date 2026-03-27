const STATUS_MAP = {
  DNF: "DNF",
  DNS: "DNS",
  DSQ: "DSQ",
  TOV: "TOV",
  OPEN: "OPEN",
  SKIP: "SKIP",
};

/**
 * Parse overall_rank value into rank (integer|null) and status.
 * @param {string} raw
 * @returns {{ rank: number|null, status: string }}
 */
export function parseRankAndStatus(raw) {
  if (!raw || typeof raw !== "string" || raw.trim() === "") {
    return { rank: null, status: "DNS" };
  }

  const trimmed = raw.trim();

  if (STATUS_MAP[trimmed]) {
    return { rank: null, status: STATUS_MAP[trimmed] };
  }

  const num = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(num) && num > 0) {
    return { rank: num, status: "finished" };
  }

  return { rank: null, status: "DNS" };
}
