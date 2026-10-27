import { parseRank } from "./normalize-status.js";
import { parseTime } from "./normalize-time.js";

/**
 * @typedef {import("./category-reader.js").Row} Row
 * @typedef {import("./category-reader.js").Column} Column
 *
 * @typedef {object} AthleteSegment one Segment of an Athlete's result; absent cells leave keys out
 * @property {number | null} [lap_seconds]
 * @property {number} [rank]
 * @property {number | null} [transition_seconds]
 * @property {number | null} [cumulative_seconds]
 * @property {number} [cumulative_rank]
 * @property {(number | null)[]} [checkpoints]
 *
 * @typedef {{ seg: AthleteSegment, checkpoints: (number | null)[] }} SegmentDraft
 */

/**
 * How each Segment Column role reads its non-empty cell into the Segment.
 * @type {Record<string, (draft: SegmentDraft, value: string) => void>}
 */
export const SEGMENT_ROLES = {
  lap({ seg }, v) {
    seg.lap_seconds = parseTime(v);
  },
  rank({ seg }, v) {
    const rank = parseRank(v);
    if (rank !== null) seg.rank = rank;
  },
  checkpoint({ checkpoints }, v) {
    checkpoints.push(parseTime(v));
  },
  transition({ seg }, v) {
    seg.transition_seconds = parseTime(v);
  },
  cumulative_time({ seg }, v) {
    seg.cumulative_seconds = parseTime(v);
  },
  cumulative_rank({ seg }, v) {
    const cumRank = parseRank(v);
    if (cumRank !== null) seg.cumulative_rank = cumRank;
  },
};

/**
 * Build normalized segment data for one athlete row.
 * @param {Row} row
 * @param {Column[]} columns the Category's columns, in declaration order
 * @param {number} segmentCount number of Segments in the Category
 * @returns {Array<Object>}
 */
export function buildSegments(row, columns, segmentCount) {
  /** @type {SegmentDraft[]} */
  const drafts = Array.from({ length: segmentCount }, () => ({
    seg: {},
    checkpoints: [],
  }));
  for (const col of columns) {
    if (col.segment === null) continue;
    const value = row.at(col);
    if (value === "") continue;
    const read = SEGMENT_ROLES[col.role];
    if (read) read(drafts[col.segment], value);
  }
  return drafts.map(({ seg, checkpoints }) => {
    if (checkpoints.length > 0) seg.checkpoints = checkpoints;
    return seg;
  });
}
