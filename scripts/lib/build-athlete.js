import { buildSegments, SEGMENT_ROLES } from "./build-segments.js";
import { parseAgeCategory } from "./normalize-age-category.js";
import { parseGender } from "./normalize-gender.js";
import { parseResidence } from "./normalize-residence.js";
import { parseRank, resolveStatus } from "./normalize-status.js";
import { parseTime } from "./normalize-time.js";

/**
 * @typedef {import("./category-reader.js").Row} Row
 * @typedef {import("./category-reader.js").Column} Column
 *
 * @typedef {object} Athlete one Athlete of the normalized output (result-schema.json)
 * @property {number | null} rank
 * @property {import("./normalize-status.js").Status} status
 * @property {string} bib
 * @property {string} name
 * @property {number | null} age
 * @property {"M" | "F" | null} gender
 * @property {string | null} residence
 * @property {number | null} total_time_seconds
 * @property {import("./normalize-age-category.js").AgeBracket | null} age_group
 * @property {string | null} age_category_raw
 * @property {{ gender: number | null, age_group: number | null }} rankings
 * @property {import("./build-segments.js").AthleteSegment[]} segments
 * @property {string} [penalty]
 * @property {string} [guide_name]
 * @property {string} [athlete_id]
 */

/**
 * Column roles that never reach the normalized output (D18).
 */
export const DROPPED_ROLES = new Set([
  "championship_rank",
  "note",
  "citizen_rank",
  "citizen_category",
]);

/** A Column role that is neither handled nor dropped. */
export class UnknownColumnRole extends Error {
  /**
   * @param {string} role
   * @param {string} where
   */
  constructor(role, where) {
    super(`Unknown Column role "${role}" (${where})`);
    this.name = "UnknownColumnRole";
    this.role = role;
  }
}

/**
 * @typedef {object} AthleteDraft
 * @property {Athlete} athlete
 * @property {string | undefined} rankCell
 * @property {string[]} statusCells
 */

/**
 * How each meta Column role reads its (trimmed) cell into the Athlete.
 * @type {Record<string, (draft: AthleteDraft, value: string) => void>}
 */
const META_ROLES = {
  overall_rank(d, v) {
    d.rankCell = v;
  },
  bib(d, v) {
    d.athlete.bib = v;
  },
  name(d, v) {
    d.athlete.name = v;
  },
  age(d, v) {
    const age = Number.parseInt(v.replace(/,/g, ""), 10);
    d.athlete.age = Number.isNaN(age) ? null : age;
  },
  gender(d, v) {
    d.athlete.gender = parseGender(v);
  },
  residence(d, v) {
    d.athlete.residence = parseResidence(v);
  },
  total_time(d, v) {
    d.athlete.total_time_seconds = parseTime(v);
  },
  // The first column with a valid rank wins.
  gender_rank(d, v) {
    if (d.athlete.rankings.gender === null)
      d.athlete.rankings.gender = parseRank(v);
  },
  // The first non-empty column wins.
  age_category(d, v) {
    if (d.athlete.age_category_raw === null) {
      d.athlete.age_group = parseAgeCategory(v);
      d.athlete.age_category_raw = v || null;
    }
  },
  age_rank(d, v) {
    if (d.athlete.rankings.age_group === null)
      d.athlete.rankings.age_group = parseRank(v);
  },
  penalty(d, v) {
    if (v) d.athlete.penalty = v;
  },
  status(d, v) {
    d.statusCells.push(v);
  },
  guide_name(d, v) {
    if (v) d.athlete.guide_name = v;
  },
  athlete_id(d, v) {
    if (v) d.athlete.athlete_id = v;
  },
};

/**
 * Throw UnknownColumnRole for a column whose role is neither handled nor
 * dropped, so no role is silently ignored.
 * @param {Column[]} columns
 * @param {string} where Category key, for the message
 */
export function checkRoles(columns, where) {
  for (const col of columns) {
    const handled =
      col.segment === null
        ? Object.hasOwn(META_ROLES, col.role) || DROPPED_ROLES.has(col.role)
        : Object.hasOwn(SEGMENT_ROLES, col.role);
    if (!handled)
      throw new UnknownColumnRole(col.role, `${where} column "${col.header}"`);
  }
}

/**
 * Build a normalized Athlete from a reader Row. Meta columns are read in
 * declaration order; a role mapped to several columns takes the last value,
 * except gender_rank / age_rank (first valid rank) and age_category (first
 * non-empty label). Run checkRoles on the columns first.
 * @param {Row} row
 * @param {Column[]} columns the Category's columns, in declaration order
 * @param {number} segmentCount number of Segments in the Category
 * @param {(token: string) => void} [onUnknownStatusToken] - called with the rank cell's text when it is no known status token
 * @returns {Athlete}
 */
export function buildAthlete(
  row,
  columns,
  segmentCount,
  onUnknownStatusToken = () => {},
) {
  /** @type {AthleteDraft} */
  const draft = {
    athlete: {
      rank: null,
      status: "DNS",
      bib: "",
      name: "",
      age: null,
      gender: null,
      residence: null,
      total_time_seconds: null,
      age_group: null,
      age_category_raw: null,
      rankings: { gender: null, age_group: null },
      segments: [],
    },
    rankCell: undefined,
    statusCells: [],
  };

  for (const col of columns) {
    if (col.segment !== null) continue;
    const read = META_ROLES[col.role];
    if (read) read(draft, row.at(col));
  }

  const { athlete } = draft;
  const { rank, status, unknownToken } = resolveStatus({
    rankCell: draft.rankCell,
    statusCells: draft.statusCells,
    hasTotalTime: athlete.total_time_seconds !== null,
  });
  athlete.rank = rank;
  athlete.status = status;
  if (unknownToken !== undefined) onUnknownStatusToken(unknownToken);

  athlete.segments = buildSegments(row, columns, segmentCount);

  return athlete;
}
