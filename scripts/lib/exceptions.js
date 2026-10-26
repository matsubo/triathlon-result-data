import { readFileSync } from "node:fs";

/**
 * Exceptions: values that are correct but break a data rule (a foreign name
 * that can't be split into family and given name, a division label that is
 * not an age bracket, two Events that share finishers but are distinct
 * races). Exceptions are permanent and carry no counts; defects waiting for
 * a fix are Known issues and live in the Known-issue ledger instead.
 *
 * Every Exceptions file has the shape { "description": string, "entries": [] }.
 */

/**
 * @typedef {{ a: string, b: string, note?: string }} DuplicatePair
 * @typedef {object} ExceptionEntries
 * @property {string} name_space 氏名 values that legitimately have no
 *   half-width space between family and given name.
 * @property {string} age_category 年齢区分 values with a gender word that name
 *   a division, not an age bracket, so they have no canonical M/F form.
 * @property {DuplicatePair} duplicate_edition Event id pairs whose Editions
 *   overlap but are distinct races.
 */

/** @type {Record<keyof ExceptionEntries, string>} */
const FILES = {
  name_space: "name-space-allowlist.json",
  age_category: "age-category-allowlist.json",
  duplicate_edition: "duplicate-allowlist.json",
};

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
    throw new Error(`${FILES[kind]}: expected { "description", "entries": [] }`);
  }
  return data.entries;
}
