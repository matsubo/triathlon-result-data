/**
 * Fixture Results source adapter: serves SourceTables from memory, keyed by
 * the request's Source reference (`id` for IRONMAN, `program` for JTU, `tsv`
 * for prepared). Used by tests to drive the Import module without a network.
 */

/** @typedef {import("../import.js").SourceTable} SourceTable */

/**
 * @param {Record<string, SourceTable | Error>} tables an Error value makes that request fail
 */
export function fixtureSource(tables) {
  /** @type {any[]} */
  const requests = [];
  return {
    /** every request received, in order */
    requests,
    /**
     * @param {{ id?: string, program?: string, tsv?: string }} request
     * @returns {Promise<SourceTable>}
     */
    async fetch(request) {
      requests.push(request);
      const key = request.id ?? request.program ?? request.tsv ?? "";
      const table = tables[key];
      if (table === undefined) throw new Error(`no fixture for ${key}`);
      if (table instanceof Error) throw table;
      return structuredClone(table);
    },
  };
}
