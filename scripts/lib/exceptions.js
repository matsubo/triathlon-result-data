import { readFileSync } from "node:fs";

/**
 * Exceptions: values that are correct but break a data rule (a foreign name
 * that can't be split into family and given name, a division label that is
 * not an age bracket, two Events that share finishers but are distinct
 * races, a Segment pace that is genuine although the pace check flags it).
 * Exceptions are permanent and carry no counts; defects waiting for a fix
 * are Known issues and live in the Known-issue ledger instead.
 *
 * Every Exceptions file has the shape { "description": string, "entries": [] }.
 */

/**
 * @typedef {{ a: string, b: string, note?: string }} DuplicatePair
 * @typedef {object} PaceException One Segment whose flagged pace is genuine.
 * @property {string} event Event id
 * @property {string} date Edition date, YYYY-MM-DD
 * @property {string} category Category id
 * @property {string} segment `<position> <sport>`, as `segmentLabel` in
 *   scripts/lib/segment-pace.js and the Segment column of
 *   `bun scripts/report-segment-pace.js`, e.g. "1 swim", "3 run"
 * @property {string} reason why the pace is genuine
 * @property {string} source URL of the race-day evidence
 * @typedef {object} ExceptionEntries
 * @property {string} name_space 氏名 values that legitimately have no
 *   half-width space between family and given name.
 * @property {string} age_category 年齢区分 values with a gender word that name
 *   a division, not an age bracket, so they have no canonical M/F form.
 * @property {DuplicatePair} duplicate_edition Event id pairs whose Editions
 *   overlap but are distinct races.
 * @property {PaceException} segment_pace Segments whose median pace is flagged
 *   by the Segment pace check but is what was raced.
 */

/** @type {Record<keyof ExceptionEntries, string>} */
const FILES = {
  name_space: "name-space-allowlist.json",
  age_category: "age-category-allowlist.json",
  duplicate_edition: "duplicate-allowlist.json",
  segment_pace: "pace-exceptions.json",
};

const PACE_FIELDS = /** @type {const} */ ([
  "event",
  "date",
  "category",
  "segment",
  "reason",
  "source",
]);

/**
 * Why the given entries are not valid entries of one kind of Exception; empty
 * when they are.
 * @param {keyof ExceptionEntries} kind
 * @param {unknown[]} entries
 * @returns {string[]}
 */
export function exceptionProblems(kind, entries) {
  if (kind !== "segment_pace") return [];
  /** @type {string[]} */
  const problems = [];
  /** @type {Set<string>} */
  const seen = new Set();
  entries.forEach((entry, i) => {
    const at = `entries[${i}]`;
    if (typeof entry !== "object" || entry === null) {
      problems.push(`${at}: expected an object`);
      return;
    }
    const e = /** @type {Record<string, unknown>} */ (entry);
    for (const field of PACE_FIELDS) {
      if (typeof e[field] !== "string" || e[field].trim() === "")
        problems.push(`${at}: "${field}" is required`);
    }
    for (const field of Object.keys(e)) {
      if (!(/** @type {readonly string[]} */ (PACE_FIELDS).includes(field)))
        problems.push(`${at}: unknown field "${field}"`);
    }
    if (typeof e.date === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(e.date))
      problems.push(`${at}: "date" must be YYYY-MM-DD`);
    if (
      typeof e.segment === "string" &&
      !/^[1-9]\d* (swim|bike|run|trail_running)$/.test(e.segment)
    )
      problems.push(
        `${at}: "segment" must be "<position> <sport>", e.g. "1 swim"`,
      );
    if (typeof e.source === "string" && !/^https?:\/\/\S+$/.test(e.source))
      problems.push(`${at}: "source" must be a URL`);
    const key = `${e.event} ${e.date} ${e.category} "${e.segment}"`;
    if (seen.has(key)) problems.push(`${at}: duplicate entry for ${key}`);
    seen.add(key);
  });
  return problems;
}

/**
 * Load the entries of one kind of Exception.
 * @template {keyof ExceptionEntries} K
 * @param {K} kind
 * @returns {ExceptionEntries[K][]}
 */
export function loadExceptions(kind) {
  const url = new URL(`../../${FILES[kind]}`, import.meta.url);
  const data = JSON.parse(readFileSync(url, "utf-8"));
  if (!Array.isArray(data.entries)) {
    throw new Error(
      `${FILES[kind]}: expected { "description", "entries": [] }`,
    );
  }
  const problems = exceptionProblems(kind, data.entries);
  if (problems.length > 0) {
    throw new Error(`${FILES[kind]}:\n  ${problems.join("\n  ")}`);
  }
  return data.entries;
}
