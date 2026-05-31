import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, test, expect } from "bun:test";

const repoRoot = resolve(import.meta.dirname, "..");
const raceInfoPath = join(repoRoot, "race-info.json");

function getAllJsonFiles(dir: string): string[] {
  const files: string[] = [];

  function traverse(currentDir: string) {
    const items = readdirSync(currentDir);

    for (const item of items) {
      if (
        item === "node_modules" ||
        item === ".git" ||
        item === ".antigravitycli" ||
        item === ".claude"
      ) {
        continue;
      }
      const fullPath = join(currentDir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (item.endsWith(".json")) {
        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files.sort();
}

describe("JSON Validity", () => {
  test("All JSON files are valid", () => {
    const jsonFiles = getAllJsonFiles(repoRoot);
    const errors: string[] = [];

    for (const filePath of jsonFiles) {
      try {
        const content = readFileSync(filePath, "utf-8");
        JSON.parse(content);
      } catch (error: any) {
        errors.push(`${filePath}: ${error.message}`);
      }
    }

    expect(errors).toEqual([]);
  }, 30000); // scans + parses every JSON file (incl. the multi-MB race-info.json); the 5s default is too tight as the dataset grows

  test("All paths referenced in race-info.json exist", () => {
    const content = readFileSync(raceInfoPath, "utf-8");
    const info = JSON.parse(content);
    const missing: string[] = [];

    for (const event of info.events || []) {
      const image = event.image;
      if (image) {
        try {
          statSync(join(repoRoot, image));
        } catch {
          missing.push(image);
        }
      }

      for (const edition of event.editions || []) {
        const weather = edition.weather_file;
        if (weather) {
          try {
            statSync(join(repoRoot, weather));
          } catch {
            missing.push(weather);
          }
        }

        for (const category of edition.categories || []) {
          const result = category.result_tsv;
          if (result) {
            try {
              statSync(join(repoRoot, result));
            } catch {
              missing.push(result);
            }
          }
        }
      }
    }

    const uniqueMissing = [...new Set(missing)].sort();
    expect(uniqueMissing).toEqual([]);
  });
});
