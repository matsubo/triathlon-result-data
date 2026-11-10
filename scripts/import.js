/**
 * Import Editions from an import plan (schemas/import-plan.schema.json).
 *
 *   bun scripts/import.js <plan.json> [--dry-run]
 *
 * Prints the ImportReport as JSON. Exit code: 0 = everything imported or
 * already imported, 2 = some Editions skipped (see their `reason`),
 * 1 = plan invalid (nothing written).
 * `--dry-run` runs every fetch and check but keeps writes in memory.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runImport } from "./lib/import.js";
import { fsRepo } from "./lib/repo.js";
import { ironmanSource } from "./lib/results-sources/ironman.js";
import { jtuSource } from "./lib/results-sources/jtu.js";
import { preparedSource } from "./lib/results-sources/prepared.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const planPath = args.find((a) => !a.startsWith("--"));
if (!planPath) {
  console.error("usage: bun scripts/import.js <plan.json> [--dry-run]");
  process.exit(1);
}

let plan;
try {
  plan = JSON.parse(readFileSync(planPath, "utf8"));
} catch (err) {
  console.log(
    JSON.stringify(
      { exit_code: 1, plan_errors: [`${planPath}: ${err.message}`] },
      null,
      2,
    ),
  );
  process.exit(1);
}

const report = await runImport(plan, {
  sources: {
    ironman: ironmanSource(),
    jtu: jtuSource(),
    prepared: preparedSource(),
  },
  repo: fsRepo(join(import.meta.dirname, "..")),
  dryRun,
});

console.log(JSON.stringify(report, null, 2));
process.exit(report.exit_code);
