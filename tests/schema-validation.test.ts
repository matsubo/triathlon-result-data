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
});
