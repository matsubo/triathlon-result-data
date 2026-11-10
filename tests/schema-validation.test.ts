import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import Ajv from "ajv";
import { describe, expect, test } from "bun:test";
import { classify } from "../scripts/lib/layout.js";
import { fsRepo } from "../scripts/lib/repo.js";

const repoRoot = resolve(import.meta.dirname, "..");
const repo = fsRepo(repoRoot);
const files = repo.list("master");

function schemaErrors(schemaFile: string, kind: "event" | "edition"): string[] {
  const ajv = new Ajv({ strict: false, allErrors: true });
  const validate = ajv.compile(JSON.parse(readFileSync(join(repoRoot, schemaFile), "utf-8")));
  const errors: string[] = [];
  for (const path of files) {
    if (classify(path)?.kind !== kind) continue;
    if (validate(JSON.parse(repo.readText(path) as string))) continue;
    for (const e of validate.errors ?? []) errors.push(`${path}: ${e.instancePath || "(root)"} ${e.message}`);
  }
  return errors;
}

describe("Schema Validation", () => {
  test("every master/<event_id>/event.json matches schemas/event.schema.json", () => {
    expect(schemaErrors("schemas/event.schema.json", "event")).toEqual([]);
  });

  test("every master/<event_id>/<date>/edition.json matches schemas/edition.schema.json", () => {
    expect(schemaErrors("schemas/edition.schema.json", "edition")).toEqual([]);
  });
});
