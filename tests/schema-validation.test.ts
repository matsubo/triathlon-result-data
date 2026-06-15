import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { describe, test, expect } from "bun:test";

const repoRoot = resolve(import.meta.dirname, "..");

describe("Schema Validation", () => {
  test("race-info.json matches race-info-schema.json", () => {
    const schema = JSON.parse(
      readFileSync(join(repoRoot, "race-info-schema.json"), "utf-8"),
    );
    const data = JSON.parse(
      readFileSync(join(repoRoot, "race-info.json"), "utf-8"),
    );

    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv as any);
    const validate = ajv.compile(schema);

    const isValid = validate(data);
    if (!isValid) {
      const errors = (validate.errors ?? [])
        .map((e) => `  ${e.instancePath || "(root)"} ${e.message}`)
        .join("\n");
      throw new Error(`race-info.json does not match race-info-schema.json:\n${errors}`);
    }

    expect(isValid).toBe(true);
  });

  test("category id and result_tsv are unique within each edition", () => {
    // JSON Schema cannot express "unique by a property" (uniqueItems compares
    // whole objects), so this invariant is enforced here. Duplicate category
    // ids collide in the app's category tabs (e.g. スプリント showing スタンダード).
    const data = JSON.parse(
      readFileSync(join(repoRoot, "race-info.json"), "utf-8"),
    );

    const problems: string[] = [];
    for (const event of data.events ?? []) {
      for (const edition of event.editions ?? []) {
        const cats = edition.categories ?? [];
        for (const key of ["id", "result_tsv"]) {
          const seen = new Map<string, number>();
          for (const c of cats) seen.set(c[key], (seen.get(c[key]) ?? 0) + 1);
          for (const [value, count] of seen) {
            if (count > 1) {
              problems.push(
                `${event.id} ${edition.date}: duplicate category ${key} "${value}" (${count}×)`,
              );
            }
          }
        }
      }
    }

    if (problems.length > 0) {
      throw new Error(`Duplicate category identifiers within editions:\n  ${problems.join("\n  ")}`);
    }
    expect(problems.length).toBe(0);
  });
});
