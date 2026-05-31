import { parseTime } from "./normalize-time.js";
import { parseInteger } from "./parse-integer.js";

/**
 * Build normalized segment data for one athlete row.
 * @param {Record<string, string>} row - TSV row as header→value map
 * @param {Array<{sport: string, distance: number, columns: Array<{header: string, role: string}>}>} segmentDefs
 * @returns {Array<Object>}
 */
export function buildSegments(row, segmentDefs) {
  return segmentDefs.map((segDef) => {
    const seg = {};
    const checkpoints = [];

    for (const col of segDef.columns) {
      const value = row[col.header];
      if (!value || value.trim() === "") continue;

      switch (col.role) {
        case "lap":
          seg.lap_seconds = parseTime(value);
          break;
        case "rank": {
          const rank = parseInteger(value);
          if (rank && rank > 0) seg.rank = rank;
          break;
        }
        case "checkpoint":
          checkpoints.push(parseTime(value));
          break;
        case "transition":
          seg.transition_seconds = parseTime(value);
          break;
        case "cumulative_time":
          seg.cumulative_seconds = parseTime(value);
          break;
        case "cumulative_rank": {
          const cumRank = parseInteger(value);
          if (cumRank && cumRank > 0) seg.cumulative_rank = cumRank;
          break;
        }
      }
    }

    if (checkpoints.length > 0) {
      seg.checkpoints = checkpoints;
    }

    return seg;
  });
}
