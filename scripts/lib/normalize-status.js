const STATUS_MAP = {
  DNF: "DNF",
  DNS: "DNS",
  DSQ: "DSQ",
  DQ: "DSQ",
  TOV: "TOV",
  OPEN: "OPEN",
  SKIP: "SKIP",
  SKP: "SKIP",
  // "Not Official Finisher": has lap times but no official finish.
  NOF: "DNF",
  // Lapped out — pulled from the course after being overtaken by a lap.
  LAP: "DNF",
  // "Not Classified" (IRONMAN) — finished but outside the classification.
  NC: "OPEN",
  // Unranked reference participation (e.g. course change, out of ranking).
  参考記録: "OPEN",
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
