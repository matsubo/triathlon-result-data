import { buildSegments } from "./build-segments.js";
import { parseAgeCategory } from "./normalize-age-category.js";
import { parseGender } from "./normalize-gender.js";
import { parseResidence } from "./normalize-residence.js";
import { parseRank, resolveStatus } from "./normalize-status.js";
import { parseTime } from "./normalize-time.js";

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
    age_category_raw: null,
    rankings: { gender: null, age_group: null },
    segments: [],
  };
  let rankCell;
  const statusCells = [];

  for (const col of metaColumnDefs) {
    const value = row[col.header];

    switch (col.role) {
      case "overall_rank":
        rankCell = value;
        break;
      case "bib":
        athlete.bib = (value || "").trim();
        break;
      case "name":
        athlete.name = (value || "").trim();
        break;
      case "age": {
        const age = Number.parseInt((value || "").trim().replace(/,/g, ""), 10);
        athlete.age = Number.isNaN(age) ? null : age;
        break;
      }
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
          athlete.rankings.gender = parseRank(value);
        }
        break;
      case "age_category":
        if (athlete.age_category_raw === null) {
          athlete.age_group = parseAgeCategory(value);
          athlete.age_category_raw = (value || "").trim() || null;
        }
        break;
      case "age_rank":
        if (athlete.rankings.age_group === null) {
          athlete.rankings.age_group = parseRank(value);
        }
        break;
      case "penalty":
        if (value && value.trim()) athlete.penalty = value.trim();
        break;
      case "status":
        statusCells.push(value);
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

  const { rank, status } = resolveStatus({
    rankCell,
    statusCells,
    hasTotalTime: athlete.total_time_seconds !== null,
  });
  athlete.rank = rank;
  athlete.status = status;

  athlete.segments = buildSegments(row, segmentDefs);

  return athlete;
}
