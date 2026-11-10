import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, test, expect } from "bun:test";

const repoRoot = resolve(import.meta.dirname, "..");

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
  }, 30000); // scans + parses every JSON file (thousands of event.json / edition.json / weather-data.json); the 5s default is too tight
});
