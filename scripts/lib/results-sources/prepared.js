/**
 * Prepared TSV Results source adapter: a TSV built outside the Import module
 * (PDF extraction, CSV conversion...). The Column roles come from the plan's
 * `meta_columns` and `segments[].columns`, since a prepared TSV has no source
 * vocabulary of its own.
 */
import { readFileSync } from "node:fs";

/** @typedef {import("../import.js").SourceTable} SourceTable */
/** @typedef {import("../import.js").SourceColumn} SourceColumn */
/**
 * @typedef {object} PreparedRequest
 * @property {string} tsv file path (absolute, or relative to the working directory)
 * @property {{header: string, role: string}[]} meta_columns
 * @property {{sport: string, distance: number, columns: {header: string, role: string}[]}[]} segments
 * @property {string[]} [unmapped] headers kept in the TSV without a Column role
 * @property {string | null} [source_url]
 */

/**
 * @param {{ readFile?: (path: string) => string }} [options]
 */
export function preparedSource({
  readFile = (path) => readFileSync(path, "utf8"),
} = {}) {
  return {
    /**
     * @param {PreparedRequest} request
     * @returns {Promise<SourceTable>}
     */
    async fetch(request) {
      const lines = readFile(request.tsv)
        .replace(/\r\n/g, "\n")
        .split("\n")
        .filter((l) => l !== "");
      if (lines.length === 0) throw new Error(`${request.tsv} is empty`);
      /** @type {SourceColumn[]} */
      const columns = [
        ...request.meta_columns.map((c) => ({
          header: c.header,
          role: c.role,
        })),
        ...request.segments.flatMap((s, segment) =>
          s.columns.map((c) => ({
            header: c.header,
            role: c.role,
            sport: s.sport,
            segment,
          })),
        ),
      ];
      return {
        headers: lines[0].split("\t"),
        rows: lines.slice(1).map((l) => l.split("\t")),
        columns,
        unmapped: request.unmapped ?? [],
        source_url: request.source_url ?? null,
        segments: request.segments.map((s) => ({
          sport: s.sport,
          distance: s.distance,
        })),
      };
    },
  };
}
