import { readFileSync, writeFileSync } from "node:fs";

/**
 * Known-issue ledger: the allowed count of each Known issue, per data rule and
 * per key (a TSV path or a Category key). The ledger is a to-fix list whose
 * counts only shrink (docs/adr/0002-known-issue-counts-only-shrink.md), so a
 * check fails on any drift from it:
 *
 *   - regression:  a key has more findings than the ledger allows
 *   - improvement: a key has fewer findings than the ledger allows
 *   - stale:       the ledger has an entry for a key the rule no longer examines
 *
 * In update mode a check never fails; it rewrites the rule's counts to the
 * current findings instead.
 *
 * File shape:
 *   { "description": string, "rules": { [rule]: { [key]: allowedCount } } }
 */

/**
 * @typedef {Record<string, Record<string, number>>} RuleCounts
 * @typedef {{ description: string, rules: RuleCounts }} LedgerData
 * @typedef {{ count: number, example?: string }} Finding
 *   What one rule found for one key. `example` illustrates a violation.
 * @typedef {Record<string, Finding>} Findings
 *   One entry per key the rule examined, including keys with count 0: a ledger
 *   key missing from the findings is reported as stale.
 * @typedef {Record<string, Findings>} FindingsByRule
 * @typedef {object} LedgerOptions
 * @property {boolean} [update] Rewrite the ledger instead of comparing.
 * @property {string} updateCommand Shell command that runs update mode; quoted
 *   in the failure messages.
 */

/**
 * @param {LedgerData} data
 * @param {LedgerOptions & { write: (data: LedgerData) => void }} options
 */
export function createLedger(data, { update = false, updateCommand, write }) {
  return {
    /**
     * Compare each given rule's findings with its allowed counts. Rules not
     * given are left alone. In update mode, record the findings as the rules'
     * new counts and report nothing.
     * @param {FindingsByRule} findingsByRule
     * @returns {string[]} one message per drift, then how to shrink the
     *   ledger if anything improved; empty when the ledger matches
     */
    check(findingsByRule) {
      if (update) {
        for (const [rule, findings] of Object.entries(findingsByRule)) {
          data.rules[rule] = currentCounts(findings);
        }
        write(data);
        return [];
      }
      const messages = [];
      let shrinkable = false;
      for (const [rule, findings] of Object.entries(findingsByRule)) {
        const allowed = data.rules[rule] || {};
        for (const key of Object.keys(findings).sort()) {
          const { count, example } = findings[key];
          const limit = allowed[key] || 0;
          if (count > limit) {
            messages.push(
              `regression: ${rule} ${key}: ${count} found, ${limit} allowed${example ? ` (e.g. ${example})` : ""}. Fix the data.`,
            );
          } else if (count < limit) {
            shrinkable = true;
            messages.push(
              `improvement: ${rule} ${key}: ${count} found, ${limit} allowed.`,
            );
          }
        }
        for (const key of Object.keys(allowed).sort()) {
          if (key in findings) continue;
          shrinkable = true;
          messages.push(
            `stale: ${rule} ${key}: ${allowed[key]} allowed, but the rule no longer examines this key.`,
          );
        }
      }
      if (shrinkable) {
        messages.push(
          `Run \`${updateCommand}\` to shrink the ledger to the current counts, and commit it.`,
        );
      }
      return messages;
    },
  };
}

/**
 * Open a ledger file. Update mode rewrites the file in place, keys sorted, so
 * the rewrite of an unchanged rule is a no-op diff.
 * @param {string} path
 * @param {LedgerOptions} options
 */
export function openLedger(path, options) {
  /** @type {LedgerData} */
  const data = JSON.parse(readFileSync(path, "utf-8"));
  if (!data.rules || typeof data.rules !== "object") {
    throw new Error(`${path}: expected { "description", "rules" }`);
  }
  return createLedger(data, {
    ...options,
    write: (next) => writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`),
  });
}

/**
 * @param {Findings} findings
 * @returns {Record<string, number>}
 */
function currentCounts(findings) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const key of Object.keys(findings).sort()) {
    if (findings[key].count > 0) counts[key] = findings[key].count;
  }
  return counts;
}
