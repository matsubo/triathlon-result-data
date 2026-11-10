import { describe, expect, test } from "bun:test";
import { parseCategory, readCategories, rewriteCells } from "../scripts/lib/category-reader.js";
import { tsvPath } from "../scripts/lib/layout.js";
import { memoryRepo } from "../scripts/lib/repo.js";
import { corpusFiles, type FixtureEvent } from "./corpus-fixture";

type Col = { header: string; role: string };

function category(id: string, meta: Col[], segments: Col[][] = []) {
  return {
    id,
    name: id,
    distance: "OD",
    description: id,
    segments: segments.map((columns, i) => ({ sport: ["swim", "bike", "run"][i], distance: 1, columns })),
    meta_columns: meta,
  };
}

function repoWith(events: FixtureEvent[], files: Record<string, string>) {
  return memoryRepo({ ...corpusFiles(events), ...files });
}

const NAME: Col = { header: "氏名", role: "name" };
const A_OD = tsvPath("a", "2024-05-01", "a_od");

describe("readCategories: parsing", () => {
  test("a duplicated header resolves to its last occurrence, with a duplicate-header finding", () => {
    const repo = repoWith(
      [{ id: "a", editions: [{ date: "2024-05-01", categories: [category("a_od", [NAME, { header: "記録", role: "total_time" }])] }] }],
      { [A_OD]: "氏名\t記録\t記録\n山田 太郎\t1:00:00\t2:00:00\n" },
    );
    const [c] = readCategories(repo).categories;
    expect(c.tsv).toBe("master/a/2024-05-01/a_od.tsv");
    expect(c.def.result_tsv).toBe(c.tsv);
    expect(c.columns("total_time")).toEqual([{ role: "total_time", header: "記録", index: 2, segment: null }]);
    expect(c.rows[0].get("total_time")).toBe("2:00:00");
    expect(c.findings.map((f) => f.kind)).toEqual(["duplicate-header"]);
  });

  test("rows carry physical line numbers across blank lines; cells are trimmed, raw keeps spaces", () => {
    const repo = repoWith([{ id: "a", editions: [{ date: "2024-05-01", categories: [category("a_od", [NAME])] }] }], {
      [A_OD]: "\n氏名 \r\n\n 山田 太郎 \r\n  \n佐藤 花子\n",
    });
    const [c] = readCategories(repo).categories;
    expect(c.headers).toEqual(["氏名"]);
    expect(c.rows.map((r) => r.line)).toEqual([4, 6]);
    expect(c.rows[0].raw).toEqual([" 山田 太郎 "]);
    expect(c.rows[0].cells).toEqual(["山田 太郎"]);
    expect(c.cells("name").map((x) => x.where)).toEqual([
      "master/a/2024-05-01/a_od.tsv:4 氏名=山田 太郎",
      "master/a/2024-05-01/a_od.tsv:6 氏名=佐藤 花子",
    ]);
  });

  test("a role mapped to several columns: get is the first non-empty in declaration order, all lists every column", () => {
    const meta = [NAME, { header: "女子順位", role: "gender_rank" }, { header: "男子順位", role: "gender_rank" }];
    const repo = repoWith(
      [{ id: "a", editions: [{ date: "2024-05-01", categories: [category("a_od", meta, [[{ header: "S", role: "lap" }]])] }] }],
      { [A_OD]: "男子順位\t氏名\t女子順位\tS\n3\t山田 太郎\t\t0:20:00\n\t佐藤 花子\t2\t0:21:00\n" },
    );
    const [c] = readCategories(repo).categories;
    expect(c.columns().map((x) => [x.header, x.segment])).toEqual([
      ["氏名", null],
      ["女子順位", null],
      ["男子順位", null],
      ["S", 0],
    ]);
    expect(c.columns(undefined, { segment: 0 }).map((x) => x.header)).toEqual(["S"]);
    expect(c.rows.map((r) => r.get("gender_rank"))).toEqual(["3", "2"]);
    expect(c.rows.map((r) => r.all("gender_rank"))).toEqual([
      ["", "3"],
      ["2", ""],
    ]);
    expect(c.cells(["gender_rank", "lap"]).map((x) => x.value)).toEqual(["", "3", "0:20:00", "2", "", "0:21:00"]);
    expect(c.rows[0].get("age")).toBe("");
  });
});

describe("parseCategory", () => {
  test("reads one Category from its definition and TSV text, without a repo", () => {
    const c = parseCategory(category("x_od", [NAME]), "氏名\n山田 太郎\n");
    expect(c.key).toBe("x_od");
    expect(c.tsv).toBe("x_od.tsv");
    expect(c.event).toBeNull();
    expect(c.rows.map((r) => r.get("name"))).toEqual(["山田 太郎"]);
    expect(parseCategory({ ...category("y", [NAME]), result_tsv: "p/y.tsv" }, null).findings.map((f) => f.message)).toEqual([
      "Result TSV not found: p/y.tsv",
    ]);
  });
});

describe("readCategories: findings", () => {
  const repo = memoryRepo({
    ...corpusFiles([
      { id: "d", editions: [{ date: "2024-05-01", categories: [category("d1", [NAME]), category("d1", [NAME])] }] },
      { id: "m", editions: [{ date: "2024-06-01", categories: [category("m", [NAME])] }] },
      {
        id: "u",
        editions: [
          { date: "2023-07-01", categories: [category("u", [NAME, { header: "年齢", role: "age" }], [[{ header: "Swim", role: "lap" }]])] },
        ],
      },
      { id: "e", editions: [] },
    ]),
    [tsvPath("d", "2024-05-01", "d1")]: "氏名\nA\n",
    [tsvPath("u", "2023-07-01", "u")]: "氏名\nA\n",
    [tsvPath("u", "2023-07-01", "orphan")]: "氏名\nA\n",
    "master/u/2023-07-01/notes.txt": "x",
    "master/u/2022-01-01/weather-data.json": "{}",
    "master/x/image.webp": "img",
    "master/README.md": "x",
  });

  test("layout findings: unexpected files, missing event.json / image / edition.json, an Event without Editions, a repeated Category", () => {
    expect(readCategories(repo).findings.map((f) => [f.kind, f.message])).toEqual([
      ["unexpected-file", "master/README.md is not a corpus file at its place"],
      ["unexpected-file", "master/u/2023-07-01/notes.txt is not a corpus file at its place"],
      ["duplicate-category", "Category d1 is listed more than once in master/d/2024-05-01/edition.json"],
      ["empty-event", "Event e has no Edition"],
      ["missing-edition-json", "Edition directory u 2022-01-01 has no master/u/2022-01-01/edition.json"],
      ["unexpected-file", "master/u/2022-01-01/weather-data.json is not a corpus file at its place"],
      ["unexpected-file", "master/u/2023-07-01/orphan.tsv is the TSV of no Category in master/u/2023-07-01/edition.json"],
      ["missing-event-json", "Event directory of x has no master/x/event.json"],
    ]);
  });

  test("layout findings follow the selection; one outside every Event only shows without a where", () => {
    expect(readCategories(repo, { eventId: "u" }).findings.map((f) => f.kind)).toEqual([
      "unexpected-file",
      "missing-edition-json",
      "unexpected-file",
      "unexpected-file",
    ]);
    expect(readCategories(repo, { eventId: "u", date: "2023" }).findings.map((f) => f.path)).toEqual([
      "master/u/2023-07-01/notes.txt",
      "master/u/2023-07-01/orphan.tsv",
    ]);
    expect(readCategories(repo, { eventId: "m" }).findings).toEqual([]);
  });

  test("Category findings: a missing TSV, and one unmapped-header per declaration whose header is absent", () => {
    const [m] = readCategories(repo, { eventId: "m" }).categories;
    expect(m.text).toBeNull();
    expect(m.rows).toEqual([]);
    expect(m.findings).toEqual([
      {
        kind: "missing-tsv",
        message: "Result TSV not found: master/m/2024-06-01/m.tsv",
        eventId: "m",
        date: "2024-06-01",
        categoryId: "m",
        tsv: "master/m/2024-06-01/m.tsv",
      },
    ]);
    const [u] = readCategories(repo, { eventId: "u" }).categories;
    expect(u.findings.map((f) => [f.kind, f.message])).toEqual([
      ["unmapped-header", 'Header mismatch in master/u/2023-07-01/u.tsv: column "年齢" not found in TSV headers'],
      ["unmapped-header", 'Header mismatch in master/u/2023-07-01/u.tsv: column "Swim" not found in TSV headers'],
    ]);
    expect(u.rows[0].at(u.columns("age")[0])).toBe("");
    expect(u.cells("age")).toEqual([]);
  });
});

describe("readCategories: where and memoization", () => {
  const repo = repoWith(
    [
      {
        id: "a",
        editions: [
          { date: "2024-09-01", categories: [category("a_sep", [NAME])] },
          { date: "2024-05-01", categories: [category("a_may", [NAME])] },
          { date: "2023-05-01", categories: [category("a_old", [NAME])] },
        ],
      },
      { id: "b", editions: [{ date: "2024-05-01", categories: [category("b_od", [NAME])] }] },
    ],
    {
      [tsvPath("a", "2024-09-01", "a_sep")]: "氏名\nSep\n",
      [tsvPath("a", "2024-05-01", "a_may")]: "氏名\nMay\n",
      [tsvPath("a", "2023-05-01", "a_old")]: "氏名\nOld\n",
      [tsvPath("b", "2024-05-01", "b_od")]: "氏名\nB\n",
    },
  );

  test("Editions are sorted by date; a year keeps every Edition of that year; a full date keeps one", () => {
    expect(readCategories(repo, { eventId: "a" }).editions.map((e) => e.key)).toEqual([
      "a/2023-05-01",
      "a/2024-05-01",
      "a/2024-09-01",
    ]);
    expect(readCategories(repo, { eventId: "a", date: "2024" }).editions.map((e) => e.key)).toEqual(["a/2024-05-01", "a/2024-09-01"]);
    const one = readCategories(repo, { eventId: "a", date: "2024-05-01" });
    expect(one.categories.map((c) => c.key)).toEqual(["a/2024-05-01/a_may"]);
    expect(one.cells("name").map((c) => c.value)).toEqual(["May"]);
    expect(readCategories(repo, { date: "2024-05" }).categories.map((c) => c.key)).toEqual([
      "a/2024-05-01/a_may",
      "b/2024-05-01/b_od",
    ]);
  });

  test("reads are memoized until a write through the repo, which the next read sees", () => {
    const [first] = readCategories(repo, { eventId: "b" }).categories;
    expect(readCategories(repo).categories).toContain(first);
    expect(first.rows[0].get("name")).toBe("B");
    repo.writeText(tsvPath("b", "2024-05-01", "b_od"), "氏名\nChanged\n");
    const [fresh] = readCategories(repo, { eventId: "b" }).categories;
    expect(fresh).not.toBe(first);
    expect(fresh.rows[0].get("name")).toBe("Changed");
  });

  test("a write to the base of an overlay is seen through the overlay", () => {
    const overlay = memoryRepo({}, repo);
    expect(readCategories(overlay, { eventId: "a" }).editions).toHaveLength(3);
    repo.writeText("master/a/2025-01-01/edition.json", JSON.stringify({ categories: [category("a_new", [NAME])] }));
    expect(readCategories(overlay, { eventId: "a" }).editions).toHaveLength(4);
  });

  test("an invalid event.json or edition.json throws", () => {
    expect(() => readCategories(memoryRepo({ "master/a/event.json": "{" }))).toThrow("master/a/event.json is not valid JSON");
    expect(() =>
      readCategories(memoryRepo({ "master/a/event.json": "{}", "master/a/2024-01-01/edition.json": "[" })),
    ).toThrow("master/a/2024-01-01/edition.json is not valid JSON");
  });
});

describe("rewriteCells", () => {
  const repo = repoWith(
    [{ id: "a", editions: [{ date: "2024-05-01", categories: [category("a_od", [NAME, { header: "区分", role: "age_category" }])] }] }],
    { [A_OD]: "氏名\t区分\tメモ\r\n山田 太郎\t男子25-29歳\t a \r\n\r\n佐藤 花子\tF30-34\t\r\n" },
  );
  const [c] = readCategories(repo).categories;

  test("replaces only the returned cells and keeps CRLF, tabs and every other byte", () => {
    const next = rewriteCells(c, "age_category", (v, row, col) => {
      expect(col.header).toBe("区分");
      return v === "男子25-29歳" ? `M25-29@${row.line}` : undefined;
    });
    expect(next).toBe("氏名\t区分\tメモ\r\n山田 太郎\tM25-29@2\t a \r\n\r\n佐藤 花子\tF30-34\t\r\n");
  });

  test("returns null when nothing changes", () => {
    expect(rewriteCells(c, "age_category", (v) => v)).toBeNull();
    expect(rewriteCells(c, "age_category", () => undefined)).toBeNull();
  });
});
