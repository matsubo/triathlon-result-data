/**
 * Status of an Athlete: the outcome vocabulary and the rank rules that decide
 * it. Every reading of a rank or status cell goes through this module.
 *
 * @typedef {"finished" | "DNF" | "DNS" | "DSQ" | "TOV" | "OPEN" | "SKIP"} Status
 */

// IRONMAN's API emits 99999 in every rank column for athletes outside the
// official ranking (DNF/DNS/DQ, and PC/ID para athletes who finished).
const PLACEHOLDER_RANK = 99999;

/**
 * Status tokens a Results source writes into an overall rank cell.
 * @type {Record<string, Exclude<Status, "finished">>}
 */
const STATUS_TOKENS = {
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

// Tokens a dedicated status column (e.g. IRONMAN's "Status") may override
// the rank cell with. NC means "not classified" there too, but the column
// carries no other unranked tokens; a SKIP beside a numeric rank
// (miyakojima 2024) does not unrank the Athlete.
const STATUS_CELL_TOKENS = new Set(["DNF", "DNS", "DSQ", "DQ", "NC"]);

// FIN in a status column confirms the rank cell's status and clears any
// override an earlier status column set.
const CONFIRMED = "FIN";

/**
 * Integer in a rank cell (commas stripped), or null when the cell holds none.
 * @param {string | null | undefined} cell
 * @returns {number | null}
 */
function rankNumber(cell) {
  if (!cell || typeof cell !== "string" || cell.trim() === "") return null;
  const num = Number.parseInt(cell.trim().replace(/,/g, ""), 10);
  return Number.isNaN(num) ? null : num;
}

/**
 * Rank from a gender, age-group or Segment rank cell: a positive integer.
 * The placeholder rank means "outside the ranking" and reads as null.
 * @param {string | null | undefined} cell
 * @returns {number | null}
 */
export function parseRank(cell) {
  const num = rankNumber(cell);
  return num !== null && num > 0 && num !== PLACEHOLDER_RANK ? num : null;
}

/**
 * Whether an overall rank cell holds a recognized status token.
 * @param {string | null | undefined} cell
 * @returns {boolean}
 */
export function isStatusToken(cell) {
  return typeof cell === "string" && Object.hasOwn(STATUS_TOKENS, cell.trim());
}

/**
 * Override a status cell asks for: a Status, null to confirm the rank cell
 * (and clear earlier overrides), or undefined when the cell says nothing.
 * @param {string | null | undefined} cell
 * @returns {Exclude<Status, "finished"> | null | undefined}
 */
function statusCellOverride(cell) {
  const token = (cell || "").trim().toUpperCase();
  if (token === CONFIRMED) return null;
  if (STATUS_CELL_TOKENS.has(token)) return STATUS_TOKENS[token];
  return undefined;
}

/**
 * Rank and Status of one Athlete.
 *
 * The overall rank cell holds a rank or a status token; an empty or
 * unreadable cell means DNS. The placeholder rank means the Athlete is
 * outside the official ranking: OPEN when they have a total time, DNS
 * otherwise. Status cells are read in column order and the last one that
 * says something wins over the rank cell; any override unranks the Athlete.
 *
 * @param {{ rankCell?: string | null, statusCells?: Array<string | null | undefined>, hasTotalTime?: boolean }} cells
 * @returns {{ rank: number | null, status: Status }}
 */
export function resolveStatus({
  rankCell,
  statusCells = [],
  hasTotalTime = false,
}) {
  let override = null;
  for (const cell of statusCells) {
    const next = statusCellOverride(cell);
    if (next !== undefined) override = next;
  }
  if (override !== null) return { rank: null, status: override };

  const token = typeof rankCell === "string" ? rankCell.trim() : "";
  if (Object.hasOwn(STATUS_TOKENS, token)) {
    return { rank: null, status: STATUS_TOKENS[token] };
  }
  const num = rankNumber(rankCell);
  if (num === PLACEHOLDER_RANK) {
    return { rank: null, status: hasTotalTime ? "OPEN" : "DNS" };
  }
  if (num !== null && num > 0) return { rank: num, status: "finished" };
  return { rank: null, status: "DNS" };
}
