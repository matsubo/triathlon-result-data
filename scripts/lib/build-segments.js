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
        case "rank":
          seg.rank = parseInteger(value);
          break;
        case "checkpoint":
          checkpoints.push(parseTime(value));
          break;
        case "transition":
          seg.transition_seconds = parseTime(value);
          break;
        case "cumulative_time":
          seg.cumulative_seconds = parseTime(value);
          break;
        case "cumulative_rank":
          seg.cumulative_rank = parseInteger(value);
          break;
      }
    }

    if (checkpoints.length > 0) {
      seg.checkpoints = checkpoints;
    }

    // If no lap_seconds but checkpoints exist, derive lap from sum of checkpoints
    if (seg.lap_seconds == null && checkpoints.length > 0) {
      const validCps = checkpoints.filter((cp) => cp != null);
      if (validCps.length > 0) {
        seg.lap_seconds = validCps.reduce((a, b) => a + b, 0);
      }
    }

    return seg;
  });
}
