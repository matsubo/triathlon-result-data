import { describe, expect, test } from "bun:test";
import {
  createLedger,
  type LedgerData,
} from "../scripts/lib/known-issue-ledger.js";

const UPDATE = "bun run update:example";

function ledgerOf(rules: LedgerData["rules"], update = false) {
  const data: LedgerData = { description: "example", rules };
  const writes: LedgerData[] = [];
  const ledger = createLedger(data, {
    update,
    updateCommand: UPDATE,
    write: (next) => writes.push(structuredClone(next)),
  });
  return { ledger, writes };
}

describe("Known-issue ledger", () => {
  test("matching counts, and clean keys with no entry, report nothing", () => {
    const { ledger } = ledgerOf({ time: { "a.tsv": 2 } });
    expect(
      ledger.check({ time: { "a.tsv": { count: 2 }, "b.tsv": { count: 0 } } }),
    ).toEqual([]);
  });

  test("a count above the allowance is a regression with its example", () => {
    const { ledger } = ledgerOf({ time: { "a.tsv": 2 } });
    const messages = ledger.check({
      time: {
        "a.tsv": { count: 3, example: "a.tsv:7 Swim=x" },
        "b.tsv": { count: 1 },
      },
    });
    expect(messages).toEqual([
      "regression: time a.tsv: 3 found, 2 allowed (e.g. a.tsv:7 Swim=x). Fix the data.",
      "regression: time b.tsv: 1 found, 0 allowed. Fix the data.",
    ]);
  });

  test("a count below the allowance fails and names the update command", () => {
    const { ledger } = ledgerOf({ time: { "a.tsv": 2 } });
    expect(ledger.check({ time: { "a.tsv": { count: 0 } } })).toEqual([
      "improvement: time a.tsv: 0 found, 2 allowed.",
      `Run \`${UPDATE}\` to shrink the ledger to the current counts, and commit it.`,
    ]);
  });

  test("an entry for a key the rule no longer examines is stale", () => {
    const { ledger } = ledgerOf({ time: { "gone.tsv": 4 } });
    expect(ledger.check({ time: {} })).toEqual([
      "stale: time gone.tsv: 4 allowed, but the rule no longer examines this key.",
      `Run \`${UPDATE}\` to shrink the ledger to the current counts, and commit it.`,
    ]);
  });

  test("rules are compared independently, with one update hint", () => {
    const { ledger } = ledgerOf({ time: { "a.tsv": 1 }, rank: { "a.tsv": 1 } });
    expect(
      ledger.check({
        time: { "a.tsv": { count: 0 } },
        rank: { "a.tsv": { count: 0 } },
      }),
    ).toEqual([
      "improvement: time a.tsv: 0 found, 1 allowed.",
      "improvement: rank a.tsv: 0 found, 1 allowed.",
      `Run \`${UPDATE}\` to shrink the ledger to the current counts, and commit it.`,
    ]);
  });

  test("rules that are not checked are not reported", () => {
    const { ledger } = ledgerOf({ time: {}, rank: { "gone.tsv": 1 } });
    expect(ledger.check({ time: {} })).toEqual([]);
  });

  test("update mode records the current non-zero counts, sorted, and keeps other rules", () => {
    const { ledger, writes } = ledgerOf(
      { time: { "a.tsv": 5, "gone.tsv": 1 }, rank: { "r.tsv": 2 } },
      true,
    );
    expect(
      ledger.check({
        time: {
          "c.tsv": { count: 1 },
          "a.tsv": { count: 3 },
          "b.tsv": { count: 0 },
        },
      }),
    ).toEqual([]);
    expect(writes).toHaveLength(1);
    expect(writes[0].rules).toEqual({
      time: { "a.tsv": 3, "c.tsv": 1 },
      rank: { "r.tsv": 2 },
    });
    expect(Object.keys(writes[0].rules.time)).toEqual(["a.tsv", "c.tsv"]);
  });
});
