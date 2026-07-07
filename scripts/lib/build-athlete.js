import { buildSegments } from "./build-segments.js";
import { parseAgeCategory } from "./normalize-age-category.js";
import { parseGender } from "./normalize-gender.js";
import { parseResidence } from "./normalize-residence.js";
import { parseRankAndStatus } from "./normalize-status.js";
import { parseTime } from "./normalize-time.js";
import { parseInteger } from "./parse-integer.js";

/**
 * Build a normalized athlete object from a TSV row.
 * @param {Record<string, string>} row
 * @param {Array<{header: string, role: string}>} metaColumnDefs
 * @param {Array<{sport: string, distance: number, columns: Array<{header: string, role: string}>}>} segmentDefs
 * @returns {Object}
 */
// IRONMAN's API emits 99999 in every rank column for athletes outside the
// official ranking (DNF/DNS/DQ, and PC/ID para athletes who finished).
const PLACEHOLDER_RANK = 99999;

// Values seen in dedicated status columns (e.g. IRONMAN's "Status").
// FIN maps to null: it confirms the overall_rank-derived status rather
// than overriding it.
const STATUS_COLUMN_MAP = {
  FIN: null,
  DNF: "DNF",
  DNS: "DNS",
  DSQ: "DSQ",
  DQ: "DSQ",
  NC: "OPEN",
};

export function buildAthlete(row, metaColumnDefs, segmentDefs) {
  const athlete = {
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
  };
  let statusOverride = null;

  for (const col of metaColumnDefs) {
    const value = row[col.header];

    switch (col.role) {
      case "overall_rank": {
        const parsed = parseRankAndStatus(value);
        athlete.rank = parsed.rank;
        athlete.status = parsed.status;
        break;
      }
      case "bib":
        athlete.bib = (value || "").trim();
        break;
      case "name":
        athlete.name = (value || "").trim();
        break;
      case "age":
        athlete.age = parseInteger(value);
        break;
      case "gender":
        athlete.gender = parseGender(value);
        break;
      case "residence":
        athlete.residence = parseResidence(value);
        break;
      case "total_time":
        athlete.total_time_seconds = parseTime(value);
        break;
      case "gender_rank": {
        if (athlete.rankings.gender === null) {
          const gr = parseInteger(value);
          athlete.rankings.gender =
            gr && gr > 0 && gr < PLACEHOLDER_RANK ? gr : null;
        }
        break;
      }
      case "age_category":
        if (athlete.age_category_raw === null) {
          athlete.age_group = parseAgeCategory(value);
          athlete.age_category_raw = (value || "").trim() || null;
        }
        break;
      case "age_rank": {
        if (athlete.rankings.age_group === null) {
          const ar = parseInteger(value);
          athlete.rankings.age_group =
            ar && ar > 0 && ar < PLACEHOLDER_RANK ? ar : null;
        }
        break;
      }
      case "penalty":
        if (value && value.trim()) athlete.penalty = value.trim();
        break;
      case "status": {
        const s = (value || "").trim().toUpperCase();
        if (s in STATUS_COLUMN_MAP) statusOverride = STATUS_COLUMN_MAP[s];
        break;
      }
      case "guide_name":
        if (value && value.trim()) athlete.guide_name = value.trim();
        break;
      case "athlete_id":
        if (value && value.trim()) athlete.athlete_id = value.trim();
        break;
      case "championship_rank":
        break;
      case "note":
        break;
    }
  }

  // A placeholder rank means "outside the official ranking", not 99999th
  // place: athletes with a finish time are unranked finishers (e.g. PC/ID
  // para division), the rest are non-starters until the status column below
  // says otherwise.
  if (athlete.rank !== null && athlete.rank >= PLACEHOLDER_RANK) {
    athlete.rank = null;
    athlete.status = athlete.total_time_seconds !== null ? "OPEN" : "DNS";
  }

  // An explicit status column wins over whatever the rank column implied.
  if (statusOverride !== null) {
    athlete.status = statusOverride;
    if (statusOverride !== "finished") athlete.rank = null;
  }

  athlete.segments = buildSegments(row, segmentDefs);

  return athlete;
}
