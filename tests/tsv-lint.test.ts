import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, test, expect } from "bun:test";

const repoRoot = resolve(import.meta.dirname, "..");
const masterDir = join(repoRoot, "master");

function getAllTsvFiles(dir: string): string[] {
  const files: string[] = [];

  function traverse(currentDir: string) {
    const items = readdirSync(currentDir);

    for (const item of items) {
      const fullPath = join(currentDir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (item.endsWith(".tsv")) {
        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files.sort();
}

function relPath(filePath: string): string {
  return filePath.replace(`${repoRoot}/`, "");
}

describe("TSV Lint Rules", () => {
  const tsvFiles = getAllTsvFiles(masterDir);

  test("No full-width spaces (U+3000)", () => {
    const errors: string[] = [];

    for (const filePath of tsvFiles) {
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("　")) {
          errors.push(`${relPath(filePath)}:${i + 1}`);
          break;
        }
      }
    }

    expect(errors).toEqual([]);
  });

  test("No repeated header rows (PDF extraction artifacts)", () => {
    const errors: string[] = [];

    for (const filePath of tsvFiles) {
      const lines = readFileSync(filePath, "utf-8").split("\n");
      if (lines.length < 3) continue;
      const header = lines[0];
      const headerCells = header.split("\t");
      const headerSig3 = headerCells.slice(0, 3).join("\t");

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const cells = line.split("\t");
        const sig3 = cells.slice(0, 3).join("\t");
        if (sig3 === headerSig3) {
          errors.push(
            `${relPath(filePath)}:${i + 1} (header row repeated mid-file)`,
          );
          break;
        }
        if (
          cells.length === 1 &&
          cells[0] === "総合" &&
          i + 1 < lines.length &&
          lines[i + 1].startsWith("順位\t")
        ) {
          errors.push(
            `${relPath(filePath)}:${i + 1} (PDF page-break header artifact)`,
          );
          break;
        }
      }
    }

    expect(errors).toEqual([]);
  });

  test("No stray relay-section headers in non-relay TSV files", () => {
    const errors: string[] = [];
    const RELAY_MARKERS = [
      "チーム名",
      "スイム氏名",
      "バイク氏名",
      "ラン氏名",
      "団体順位",
    ];

    for (const filePath of tsvFiles) {
      const lines = readFileSync(filePath, "utf-8").split("\n");
      if (lines.length < 2) continue;
      const headerCells = lines[0].split("\t");
      if (RELAY_MARKERS.some((m) => headerCells.includes(m))) continue;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const cells = line.split("\t");
        if (RELAY_MARKERS.some((m) => cells.includes(m))) {
          errors.push(
            `${relPath(filePath)}:${i + 1} (relay header found mid-file)`,
          );
          break;
        }
      }
    }

    expect(errors).toEqual([]);
  });

  test("Overall rank is unique in each TSV file", () => {
    const errors: string[] = [];
    const RANK_HEADERS = ["総合順位", "順位", "Pos", "Overall_Rank", "Rank"];

    for (const filePath of tsvFiles) {
      const lines = readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
      if (lines.length < 5) continue;
      const headerCells = lines[0].split("\t");
      if (!RANK_HEADERS.includes(headerCells[0])) continue;

      const seen = new Map<string, number>();
      let duplicates = 0;
      const exampleRanks: string[] = [];
      for (let i = 1; i < lines.length; i++) {
        const rank = lines[i].split("\t")[0];
        if (!/^\d+$/.test(rank)) continue;
        const count = (seen.get(rank) || 0) + 1;
        seen.set(rank, count);
        if (count === 2) {
          duplicates++;
          if (exampleRanks.length < 3) exampleRanks.push(rank);
        }
      }

      if (duplicates >= 5) {
        errors.push(
          `${relPath(filePath)} — ${duplicates} duplicate numeric ranks in 総合順位 column (e.g. ${exampleRanks.join(", ")}).`,
        );
      }
    }

    expect(errors).toEqual([]);
  });

  test("IRONMAN / IRONMAN 70.3 TSVs include ContactId/Country/Status", () => {
    const errors: string[] = [];
    const REQUIRED = ["ContactId", "Country", "Status"];

    for (const filePath of tsvFiles) {
      const rel = relPath(filePath);
      if (!/^master\/\d+\/(im703|ironman)_[^/]+\//.test(rel)) continue;

      const lines = readFileSync(filePath, "utf-8").split("\n");
      if (lines.length < 2) continue;
      const headerCells = lines[0].split("\t");
      const missing = REQUIRED.filter((c) => !headerCells.includes(c));
      if (missing.length > 0) {
        errors.push(`${rel} — missing: ${missing.join(", ")}`);
      }
    }

    expect(errors).toEqual([]);
  });

  test("All IRONMAN meta_columns cover the TSV's ContactId/Country/Status", () => {
    const raceInfo = JSON.parse(
      readFileSync(join(repoRoot, "race-info.json"), "utf-8"),
    );
    const REQUIRED = ["ContactId", "Country", "Status"];
    const errors: string[] = [];

    for (const event of raceInfo.events || []) {
      if (!event.id.startsWith("im703_") && !event.id.startsWith("ironman_")) {
        continue;
      }
      for (const edition of event.editions || []) {
        for (const cat of edition.categories || []) {
          const tsv = cat.result_tsv;
          if (!tsv) continue;
          const tsvPath = join(repoRoot, tsv);
          let header: string;
          try {
            header = readFileSync(tsvPath, "utf-8").split("\n")[0];
          } catch {
            continue;
          }
          const headers = header.split("\t");
          const metaHeaders = (cat.meta_columns || []).map((c: any) => c.header);
          const missing = REQUIRED.filter(
            (col) => headers.includes(col) && !metaHeaders.includes(col),
          );
          if (missing.length > 0) {
            errors.push(
              `${cat.id} (${tsv}) — TSV has [${missing.join(", ")}] but meta_columns does not.`,
            );
          }
        }
      }
    }

    expect(errors).toEqual([]);
  });
});
