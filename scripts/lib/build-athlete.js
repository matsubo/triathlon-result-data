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
    rankings: { gender: null, age_group: null },
    segments: [],
  };

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
      case "gender_rank":
        if (athlete.rankings.gender === null) {
          athlete.rankings.gender = parseInteger(value);
        }
        break;
      case "age_category":
        athlete.age_group = parseAgeCategory(value);
        break;
      case "age_rank":
        athlete.rankings.age_group = parseInteger(value);
        break;
      case "penalty":
        if (value && value.trim()) athlete.penalty = value.trim();
        break;
      case "status":
        break;
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

  athlete.segments = buildSegments(row, segmentDefs);

  return athlete;
}
