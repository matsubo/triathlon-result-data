import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { describe, test, expect } from "bun:test";

const repoRoot = resolve(import.meta.dirname, "..");
const masterDir = join(repoRoot, "master");
const schemaPath = join(repoRoot, "weather-schema.json");

function findWeatherDataFiles(dir: string): string[] {
  const files: string[] = [];

  function traverse(currentDir: string) {
    try {
      const items = readdirSync(currentDir);

      for (const item of items) {
        const fullPath = join(currentDir, item);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          traverse(fullPath);
        } else if (item === "weather-data.json") {
          files.push(fullPath);
        }
      }
    } catch (_error) {
      // Skip directories we can't read
    }
  }

  traverse(dir);
  return files.sort();
}

describe("Weather Data Validation", () => {
  const weatherFiles = findWeatherDataFiles(masterDir);
  const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
  const ajv = new Ajv({ strict: false });
  addFormats(ajv as any);
  const validate = ajv.compile(schema);

  test(`All ${weatherFiles.length} weather data files match weather-schema.json`, () => {
    const errors: string[] = [];

    for (const file of weatherFiles) {
      try {
        const content = readFileSync(file, "utf-8");
        const data = JSON.parse(content);
        const isValid = validate(data);
        if (!isValid) {
          const detail = (validate.errors ?? [])
            .map((err) => `    ${err.instancePath || "root"}: ${err.message}`)
            .join("\n");
          errors.push(`${file.replace(repoRoot, "")}:\n${detail}`);
        }
      } catch (error: any) {
        errors.push(`${file.replace(repoRoot, "")}: ${error.message}`);
      }
    }

    expect(errors).toEqual([]);
  });
});
