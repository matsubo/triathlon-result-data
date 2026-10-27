import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { buildAthlete } from "../scripts/lib/build-athlete.js";
import { type Category, type Cell, readCategories } from "../scripts/lib/category-reader.js";
import { loadExceptions } from "../scripts/lib/exceptions.js";
import { type Findings, openLedger } from "../scripts/lib/known-issue-ledger.js";
import { canonicalAgeCategory, classifyAgeCategory } from "../scripts/lib/normalize-age-category.js";
import { isNonValue, isValidRankCell } from "../scripts/lib/normalize-status.js";
import { parseTime } from "../scripts/lib/normalize-time.js";
import { fsRepo } from "../scripts/lib/repo.js";

const repoRoot = resolve(import.meta.dirname, "..");
const corpus = readCategories(fsRepo(repoRoot));
const { categories } = corpus;

/** Every registered TSV with its raw text, once per file. */
const files = [...new Map(categories.filter((c) => c.text !== null).map((c) => [c.tsv, c.text as string]))].map(
  ([tsv, text]) => ({ tsv, lines: text.split("\n") }),
);

const ledger = openLedger(join(repoRoot, "tsv-lint-known-issues.json"), {
  update: process.env.UPDATE_KNOWN_ISSUES === "1",
  updateCommand: "bun run update:tsv-lint-known-issues",
});

/**
 * Ledger findings of a cell rule: one entry per Category TSV that has a
 * column of the roles, counting the cells `ok` rejects.
 */
function cellFindings(roles: string[], ok: (cell: Cell) => boolean): Findings {
  const findings: Findings = {};
  for (const category of categories) {
    if (!category.columns().some((c) => roles.includes(c.role) && c.index >= 0)) continue;
    const bad = category.cells(roles).filter((cell) => !ok(cell));
    findings[category.tsv] = { count: bad.length, example: bad.slice(0, 3).map((c) => c.where).join("; ") };
  }
  return findings;
}

const TIME_ROLES = ["lap", "total_time", "cumulative_time", "transition", "checkpoint"];
const RANK_ROLES = ["overall_rank", "gender_rank", "age_rank", "rank", "cumulative_rank"];

describe("Registered Categories", () => {
  test("no Edition repeats, no TSV is shared by Categories, every master/ TSV is registered", () => {
    expect(corpus.findings.map((f) => f.message)).toEqual([]);
  });

  test("every Category's result TSV exists", () => {
    const missing = categories.flatMap((c) => c.findings).filter((f) => f.kind === "missing-tsv");
    expect(missing.map((f) => f.message)).toEqual([]);
  });
});

describe("TSV Lint Rules: raw text", () => {
  test("No full-width spaces (U+3000)", () => {
    const errors: string[] = [];
    for (const { tsv, lines } of files) {
      const i = lines.findIndex((l) => l.includes("　"));
      if (i >= 0) errors.push(`${tsv}:${i + 1}`);
    }
    expect(errors).toEqual([]);
  });

  test("No repeated header rows (PDF extraction artifacts)", () => {
    const errors: string[] = [];
    for (const { tsv, lines } of files) {
      if (lines.length < 3) continue;
      const headerSig3 = lines[0].split("\t").slice(0, 3).join("\t");
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const cells = line.split("\t");
        if (cells.slice(0, 3).join("\t") === headerSig3) {
          errors.push(`${tsv}:${i + 1} (header row repeated mid-file)`);
          break;
        }
        if (cells.length === 1 && cells[0] === "総合" && i + 1 < lines.length && lines[i + 1].startsWith("順位\t")) {
          errors.push(`${tsv}:${i + 1} (PDF page-break header artifact)`);
          break;
        }
      }
    }
    expect(errors).toEqual([]);
  });

  test("No stray relay-section headers in non-relay TSV files", () => {
    const errors: string[] = [];
    const RELAY_MARKERS = ["チーム名", "スイム氏名", "バイク氏名", "ラン氏名", "団体順位"];
    for (const { tsv, lines } of files) {
      if (lines.length < 2) continue;
      const headerCells = lines[0].split("\t");
      if (RELAY_MARKERS.some((m) => headerCells.includes(m))) continue;
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;
        const cells = lines[i].split("\t");
        if (RELAY_MARKERS.some((m) => cells.includes(m))) {
          errors.push(`${tsv}:${i + 1} (relay header found mid-file)`);
          break;
        }
      }
    }
    expect(errors).toEqual([]);
  });

  test("No data beyond the header's column count", () => {
    // A data row wider than the header means a column was dropped from the
    // header or inserted mid-row during import — every downstream mapping
    // silently reads shifted values.
    const findings: Findings = {};
    for (const { tsv, lines } of files) {
      if (lines.length < 2) continue;
      const nCols = lines[0].split("\t").length;
      let count = 0;
      let example = "";
      for (let ln = 1; ln < lines.length; ln++) {
        if (!lines[ln].trim()) continue;
        const cells = lines[ln].split("\t");
        if (cells.length > nCols && cells.slice(nCols).some((c) => c.trim() !== "")) {
          count++;
          if (!example) example = `line ${ln + 1}`;
        }
      }
      findings[tsv] = { count, example: `first at ${example}, header has ${nCols} columns` };
    }
    expect(ledger.check({ extra_columns: findings })).toEqual([]);
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
    for (const dir of [join(repoRoot, "master"), join(repoRoot, "images")]) walk(dir);
    expect(errors).toEqual([]);
  });
});

describe("TSV Lint Rules: cells by Column role", () => {
  test("Time cells parse as times, or hold a status token or blank mark", () => {
    // A time cell normalization can't read (and that is no recognized
    // non-value) is a time lost from the normalized output.
    const findings = cellFindings(TIME_ROLES, (c) => c.value === "" || parseTime(c.value) !== null || isNonValue(c.value));
    expect(ledger.check({ time_format: findings })).toEqual([]);
  });

  test("Rank cells hold integers, the placeholder rank, or status tokens", () => {
    const findings = cellFindings(RANK_ROLES, (c) => isValidRankCell(c.value));
    expect(ledger.check({ rank_numeric: findings })).toEqual([]);
  });

  test("Overall rank is unique among finished Athletes, except ties on the total time", () => {
    // A rank shared by finished Athletes with different (or missing) total
    // times is a repeat; five or more repeats mean the rank column is broken
    // (a rank restarting per gender or division, shifted cells).
    const errors: string[] = [];
    for (const category of categories) {
      if (category.columns("overall_rank").every((c) => c.index < 0)) continue;
      const columns = category.columns();
      const timeOfRank = new Map<number, number | null>();
      const repeated = new Set<number>();
      for (const row of category.rows) {
        const athlete = buildAthlete(row, columns, category.def.segments.length);
        if (athlete.name === "" || athlete.status !== "finished" || athlete.rank === null) continue;
        const time = athlete.total_time_seconds;
        if (!timeOfRank.has(athlete.rank)) timeOfRank.set(athlete.rank, time);
        else if (time === null || timeOfRank.get(athlete.rank) !== time) repeated.add(athlete.rank);
      }
      if (repeated.size >= 5) {
        errors.push(
          `${category.tsv} — ${repeated.size} overall ranks shared by finished Athletes with different total times (e.g. ${[...repeated].slice(0, 3).join(", ")}).`,
        );
      }
    }
    expect(errors).toEqual([]);
  }, 30_000); // normalizes every Athlete of the corpus

  describe("names (role name)", () => {
    const names = corpus.cells("name");

    test("no full-width Latin letters", () => {
      // Alphabet names must use half-width ASCII (Ｔｏｍ → Tom) so the same
      // athlete matches across races regardless of the source's encoding style.
      const errors = names.filter((c) => /[Ａ-Ｚａ-ｚ]/.test(c.value)).map((c) => c.where);
      expect(errors).toEqual([]);
    });

    test("no consecutive half-width spaces", () => {
      const errors = names.filter((c) => / {2,}/.test(c.raw)).map((c) => c.where);
      expect(errors).toEqual([]);
    });

    test("Japanese names have a half-width space between family and given name", () => {
      const allowSet = new Set(loadExceptions("name_space"));
      // Team names, placeholders, and joke entries carry digits/brackets/nakaguro
      // and are never split into family/given name.
      const NON_NAME_PATTERN = /[0-90-9０-９・･()（）+＋@＠=＝*？?！!]/;
      // CJK ideographs, hiragana, katakana (full and half width).
      const JAPANESE_SCRIPT = /[一-鿿぀-ゟ゠-ヿｦ-ﾝ]/;
      const hasAge = new Map<Category, boolean>();
      const errors: string[] = [];
      for (const cell of names) {
        const name = cell.value;
        if (name === "" || name.includes(" ")) continue; // empty or already spaced
        if (name.length < 2) continue; // single character, nothing to split
        if (!JAPANESE_SCRIPT.test(name)) continue; // not a Japanese name
        if (NON_NAME_PATTERN.test(name)) continue; // team/placeholder entry
        let ageColumn = hasAge.get(cell.category);
        if (ageColumn === undefined) {
          ageColumn = cell.category.columns("age").some((c) => c.index >= 0);
          hasAge.set(cell.category, ageColumn);
        }
        // blank age is this repo's convention for team/nickname sign-ins (e.g. hiwasa)
        if (ageColumn && cell.row.get("age") === "") continue;
        if (allowSet.has(name)) continue;
        errors.push(cell.where);
      }
      expect(errors).toEqual([]);
    });
  });

  test("年齢区分 values use the canonical M/F label instead of a Japanese gender word", () => {
    // 男子25-29歳 / 25-29男子 / 30歳代男子 must be written M25-29 / M30-39
    // (F for 女子; F0-24 for 24歳以下; M65+ for 65歳以上) so the same bracket
    // renders identically across events. Fix with
    // `bun run scripts/fix-age-category-labels.js`. Division labels that are
    // not age brackets (一般男子, 高校生女子, …) go in age-category-allowlist.json;
    // unfixable source defects are counted in tsv-lint-known-issues.json.
    const allow = new Set(loadExceptions("age_category"));
    const findings: Findings = {};
    for (const category of categories) {
      if (category.text === null || category.columns("age_category").length === 0) continue;
      const errors: string[] = [];
      for (const cell of category.cells("age_category")) {
        const v = cell.value;
        if (allow.has(v)) continue;
        const kind = classifyAgeCategory(v);
        if (kind === "fixable") errors.push(`${cell.where} (fixable → ${canonicalAgeCategory(v)})`);
        else if (kind === "no-canonical-form") errors.push(`${cell.where} (no canonical form)`);
      }
      findings[category.tsv] = { count: errors.length, example: errors.slice(0, 3).join("; ") };
    }
    expect(ledger.check({ age_category_label: findings })).toEqual([]);
  });

  describe("IRONMAN Categories (source_ref.results_source ironman)", () => {
    const REQUIRED = ["ContactId", "Country", "Status"];
    const ironman = categories.filter((c) => c.def.source_ref?.results_source === "ironman" && c.text !== null);

    test("the TSV includes ContactId/Country/Status", () => {
      const errors: string[] = [];
      for (const c of ironman) {
        const missing = REQUIRED.filter((h) => !c.headers.includes(h));
        if (missing.length > 0) errors.push(`${c.tsv} — missing: ${missing.join(", ")}`);
      }
      expect(errors).toEqual([]);
    });

    test("meta_columns cover the TSV's ContactId/Country/Status", () => {
      const errors: string[] = [];
      for (const c of ironman) {
        const mapped = new Set(c.columns(undefined, { segment: null }).map((col) => col.header));
        const missing = REQUIRED.filter((h) => c.headers.includes(h) && !mapped.has(h));
        if (missing.length > 0) {
          errors.push(`${c.def.id} (${c.tsv}) — TSV has [${missing.join(", ")}] but meta_columns does not.`);
        }
      }
      expect(errors).toEqual([]);
    });
  });
});
