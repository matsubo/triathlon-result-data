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

  test("氏名 values do not contain full-width Latin letters", () => {
    // Alphabet names must use half-width ASCII (Ｔｏｍ → Tom) so the same
    // athlete matches across races regardless of the source's encoding style.
    const FW_LATIN = /[Ａ-Ｚａ-ｚ]/;
    const errors: string[] = [];

    for (const filePath of tsvFiles) {
      const lines = readFileSync(filePath, "utf-8").split("\n");
      if (lines.length < 2) continue;
      const headerCells = lines[0].split("\t").map((h) => h.trim());
      const nameIdx = headerCells.findIndex((h) =>
        ["氏名", "氏 名", "Name"].includes(h),
      );
      if (nameIdx === -1) continue;

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const name = lines[i].split("\t")[nameIdx];
        if (name && FW_LATIN.test(name)) {
          errors.push(`${relPath(filePath)}:${i + 1} (${name})`);
        }
      }
    }

    expect(errors).toEqual([]);
  });

  test("氏名 values do not contain consecutive half-width spaces", () => {
    const errors: string[] = [];

    for (const filePath of tsvFiles) {
      const lines = readFileSync(filePath, "utf-8").split("\n");
      if (lines.length < 2) continue;
      const headerCells = lines[0].split("\t");
      const nameIdx = headerCells.indexOf("氏名");
      if (nameIdx === -1) continue;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const cells = line.split("\t");
        const name = cells[nameIdx];
        if (!name) continue;
        if (/ {2,}/.test(name)) {
          errors.push(`${relPath(filePath)}:${i + 1} (${name})`);
        }
      }
    }

    expect(errors).toEqual([]);
  });

  test("Japanese 氏名 values contain a half-width space between family and given name", () => {
    const errors: string[] = [];
    const allowlist: string[] = JSON.parse(
      readFileSync(join(repoRoot, "name-space-allowlist.json"), "utf-8"),
    ).names;
    const allowSet = new Set(allowlist);

    // Team names, placeholders, and joke entries carry digits/brackets/nakaguro
    // and are never split into family/given name.
    const NON_NAME_PATTERN = /[0-90-9０-９・･()（）+＋@＠=＝*？?！!]/;
    const JAPANESE_SCRIPT = /[一-鿿぀-ゟ゠-ヿ]/;

    for (const filePath of tsvFiles) {
      const lines = readFileSync(filePath, "utf-8").split("\n");
      if (lines.length < 2) continue;
      const headerCells = lines[0].split("\t");
      const nameIdx = headerCells.indexOf("氏名");
      if (nameIdx === -1) continue;
      const ageIdx = headerCells.indexOf("年齢");

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const cells = line.split("\t");
        const name = cells[nameIdx];
        if (!name || !name.trim()) continue;
        if (name.includes(" ")) continue; // already spaced
        if (name.length < 2) continue; // single character/token, nothing to split
        if (!JAPANESE_SCRIPT.test(name)) continue; // non-Japanese-script, out of scope
        if (NON_NAME_PATTERN.test(name)) continue; // team/placeholder entry
        // blank age is this repo's convention for team/nickname sign-ins (e.g. hiwasa)
        if (ageIdx !== -1 && cells[ageIdx] !== undefined && cells[ageIdx].trim() === "") {
          continue;
        }
        if (allowSet.has(name)) continue;

        errors.push(`${relPath(filePath)}:${i + 1} (${name})`);
      }
    }

    expect(errors).toEqual([]);
  });

  const knownIssues = JSON.parse(
    readFileSync(join(repoRoot, "tsv-lint-known-issues.json"), "utf-8"),
  );

  // Time-like value: H:MM:SS / MM:SS with optional fractional seconds and an
  // optional trailing flag token (e.g. "2:39:42 P"), or a placeholder/status.
  const TIME_VALUE = /^\d{1,3}:\d{2}(:\d{2})?(\.\d+)?(\s+\S+)?$/;
  const NON_VALUE =
    /^(-+|\*+|--:--:--|DNF|DNS|DSQ|DQ|TOV|OPEN|SKIP|SKP|NOF|NC|FIN|LAP|参考記録)$/;

  function collectViolations(
    headerMatches: (h: string) => boolean,
    valueOk: (v: string) => boolean,
    knownKey: string,
  ): string[] {
    const known: Record<string, number> = knownIssues[knownKey] || {};
    const errors: string[] = [];

    for (const filePath of tsvFiles) {
      const rel = relPath(filePath);
      const lines = readFileSync(filePath, "utf-8").split("\n");
      if (lines.length < 2) continue;
      const headers = lines[0].split("\t").map((h) => h.trim());
      const idxs = headers
        .map((h, i) => (headerMatches(h) ? i : -1))
        .filter((i) => i !== -1);
      if (idxs.length === 0) continue;

      const fileErrors: string[] = [];
      for (let ln = 1; ln < lines.length; ln++) {
        if (!lines[ln].trim()) continue;
        const cells = lines[ln].split("\t");
        for (const i of idxs) {
          const v = (cells[i] || "").trim();
          if (v && !valueOk(v)) {
            fileErrors.push(`${rel}:${ln + 1} ${headers[i]}=${v}`);
          }
        }
      }
      const allowed = known[rel] || 0;
      if (fileErrors.length > allowed) {
        errors.push(
          `${rel}: ${fileErrors.length} violations (allowed ${allowed}), e.g. ${fileErrors.slice(0, 3).join("; ")}`,
        );
      }
    }
    return errors;
  }

  test("Time columns contain parseable times", () => {
    // ラップ/記録/スプリット columns and IRONMAN's Swim/Bike/Run/T1/T2/Total_Time;
    // headers naming a rank (順/順位) are excluded — those are covered below.
    const isTimeHeader = (h: string) =>
      !/順/.test(h) &&
      (/(ラップ|ﾗｯﾌﾟ|記録|ｽﾌﾟﾘｯﾄ|スプリット|タイム)/.test(h) ||
        /^(Swim|Bike|Run|T1|T2|Total_Time|LAP\d+)$/.test(h));
    const errors = collectViolations(
      isTimeHeader,
      (v) => TIME_VALUE.test(v) || NON_VALUE.test(v),
      "time_format",
    );
    expect(errors).toEqual([]);
  });

  test("Rank columns contain integers or status tokens", () => {
    // Segment/gender/age rank columns; overall-rank columns legitimately mix
    // integers with status strings, which NON_VALUE covers.
    const isRankHeader = (h: string) => /(順$|順位$|_Rank$)/.test(h);
    const errors = collectViolations(
      isRankHeader,
      (v) => /^\d+$/.test(v) || NON_VALUE.test(v),
      "rank_numeric",
    );
    expect(errors).toEqual([]);
  });

  test("No data beyond the header's column count", () => {
    // A data row wider than the header means a column was dropped from the
    // header or inserted mid-row during import — every downstream mapping
    // silently reads shifted values.
    const known: Record<string, number> = knownIssues.extra_columns || {};
    const errors: string[] = [];

    for (const filePath of tsvFiles) {
      const rel = relPath(filePath);
      const lines = readFileSync(filePath, "utf-8").split("\n");
      if (lines.length < 2) continue;
      const nCols = lines[0].split("\t").length;

      let count = 0;
      let example = "";
      for (let ln = 1; ln < lines.length; ln++) {
        if (!lines[ln].trim()) continue;
        const cells = lines[ln].split("\t");
        if (
          cells.length > nCols &&
          cells.slice(nCols).some((c) => c.trim() !== "")
        ) {
          count++;
          if (!example) example = `line ${ln + 1}`;
        }
      }
      const allowed = known[rel] || 0;
      if (count > allowed) {
        errors.push(
          `${rel}: ${count} rows wider than the ${nCols}-column header (allowed ${allowed}), first at ${example}`,
        );
      }
    }

    expect(errors).toEqual([]);
  });

  test("All filenames under master/ and images/ are ASCII", () => {
    const errors: string[] = [];

    function walk(dir: string) {
      for (const item of readdirSync(dir)) {
        const fullPath = join(dir, item);
        // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ASCII range check
        if (!/^[\x00-\x7f]+$/.test(item)) {
          errors.push(`${fullPath.replace(`${repoRoot}/`, "")} (non-ASCII filename)`);
        }
        if (statSync(fullPath).isDirectory()) walk(fullPath);
      }
    }

    for (const dir of [masterDir, join(repoRoot, "images")]) {
      walk(dir);
    }

    expect(errors).toEqual([]);
  });
});
