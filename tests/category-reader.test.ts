import { describe, expect, test } from "bun:test";
import { readCategories, rewriteCells } from "../scripts/lib/category-reader.js";
import { memoryRepo } from "../scripts/lib/repo.js";

type Col = { header: string; role: string };

function category(id: string, tsv: string, meta: Col[], segments: Col[][] = []) {
  return {
    id,
    result_tsv: tsv,
    name: id,
    distance: "OD",
    description: id,
    segments: segments.map((columns, i) => ({ sport: ["swim", "bike", "run"][i], distance: 1, columns })),
    meta_columns: meta,
  };
}

function repoWith(events: unknown[], files: Record<string, string>) {
  return memoryRepo({ "race-info.json": JSON.stringify({ events }), ...files });
}

const NAME: Col = { header: "氏名", role: "name" };

describe("readCategories: parsing", () => {
  test("a duplicated header resolves to its last occurrence, with a duplicate-header finding", () => {
    const repo = repoWith(
      [{ id: "a", editions: [{ date: "2024-05-01", categories: [category("a_od", "master/2024/a/od.tsv", [NAME, { header: "記録", role: "total_time" }])] }] }],
      { "master/2024/a/od.tsv": "氏名\t記録\t記録\n山田 太郎\t1:00:00\t2:00:00\n" },
    );
    const [c] = readCategories(repo).categories;
    expect(c.columns("total_time")).toEqual([{ role: "total_time", header: "記録", index: 2, segment: null }]);
    expect(c.rows[0].get("total_time")).toBe("2:00:00");
    expect(c.findings.map((f) => f.kind)).toEqual(["duplicate-header"]);
  });

  test("rows carry physical line numbers across blank lines; cells are trimmed, raw keeps spaces", () => {
    const repo = repoWith(
      [{ id: "a", editions: [{ date: "2024-05-01", categories: [category("a_od", "master/2024/a/od.tsv", [NAME])] }] }],
      { "master/2024/a/od.tsv": "\n氏名 \r\n\n 山田 太郎 \r\n  \n佐藤 花子\n" },
    );
    const [c] = readCategories(repo).categories;
    expect(c.headers).toEqual(["氏名"]);
    expect(c.rows.map((r) => r.line)).toEqual([4, 6]);
    expect(c.rows[0].raw).toEqual([" 山田 太郎 "]);
    expect(c.rows[0].cells).toEqual(["山田 太郎"]);
    expect(c.cells("name").map((x) => x.where)).toEqual([
      "master/2024/a/od.tsv:4 氏名=山田 太郎",
      "master/2024/a/od.tsv:6 氏名=佐藤 花子",
    ]);
  });

  test("a role mapped to several columns: get is the first non-empty in declaration order, all lists every column", () => {
    const meta = [NAME, { header: "女子順位", role: "gender_rank" }, { header: "男子順位", role: "gender_rank" }];
    const repo = repoWith(
      [{ id: "a", editions: [{ date: "2024-05-01", categories: [category("a_od", "master/2024/a/od.tsv", meta, [[{ header: "S", role: "lap" }]])] }] }],
      { "master/2024/a/od.tsv": "男子順位\t氏名\t女子順位\tS\n3\t山田 太郎\t\t0:20:00\n\t佐藤 花子\t2\t0:21:00\n" },
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

describe("readCategories: findings", () => {
  const defs = {
    shared1: category("s1", "master/2024/s/shared.tsv", [NAME]),
    shared2: category("s2", "master/2024/s/shared.tsv", [NAME]),
    missing: category("m", "master/2024/m/missing.tsv", [NAME]),
    unmapped: category("u", "master/2024/u/u.tsv", [NAME, { header: "年齢", role: "age" }], [[{ header: "Swim", role: "lap" }]]),
  };
  const repo = repoWith(
    [
      { id: "s", editions: [{ date: "2024-05-01", categories: [defs.shared1] }, { date: "2024-05-01", categories: [defs.shared2] }] },
      { id: "m", editions: [{ date: "2024-06-01", categories: [defs.missing] }] },
      { id: "u", editions: [{ date: "2023-07-01", categories: [defs.unmapped] }] },
    ],
    {
      "master/2024/s/shared.tsv": "氏名\nA\n",
      "master/2024/u/u.tsv": "氏名\nA\n",
      "master/2024/x/orphan.tsv": "氏名\nA\n",
      "master/2024/x/weather-data.json": "{}",
    },
  );

  test("corpus findings: a repeated Edition, a shared TSV, an unregistered TSV", () => {
    expect(readCategories(repo).findings).toEqual([
      { kind: "duplicate-edition", message: "Edition s 2024-05-01 is registered more than once", eventId: "s", date: "2024-05-01" },
      {
        kind: "shared-tsv",
        message: "master/2024/s/shared.tsv is the result TSV of 2 Categories: s/2024-05-01/s1, s/2024-05-01/s2",
        tsv: "master/2024/s/shared.tsv",
      },
      { kind: "unregistered-tsv", message: "master/2024/x/orphan.tsv is no Category's result TSV", tsv: "master/2024/x/orphan.tsv" },
    ]);
  });

  test("an unregistered TSV is only reported without a where; other corpus findings follow the selection", () => {
    expect(readCategories(repo, { eventId: "s" }).findings.map((f) => f.kind)).toEqual(["duplicate-edition", "shared-tsv"]);
    expect(readCategories(repo, { eventId: "m" }).findings).toEqual([]);
  });

  test("Category findings: a missing TSV, and one unmapped-header per declaration whose header is absent", () => {
    const [m] = readCategories(repo, { eventId: "m" }).categories;
    expect(m.text).toBeNull();
    expect(m.rows).toEqual([]);
    expect(m.findings).toEqual([
      { kind: "missing-tsv", message: "Result TSV not found: master/2024/m/missing.tsv", eventId: "m", date: "2024-06-01", categoryId: "m", tsv: "master/2024/m/missing.tsv" },
    ]);
    const [u] = readCategories(repo, { eventId: "u" }).categories;
    expect(u.findings.map((f) => [f.kind, f.message])).toEqual([
      ["unmapped-header", 'Header mismatch in master/2024/u/u.tsv: column "年齢" not found in TSV headers'],
      ["unmapped-header", 'Header mismatch in master/2024/u/u.tsv: column "Swim" not found in TSV headers'],
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
          { date: "2024-09-01", categories: [category("a_sep", "master/2024/a/sep.tsv", [NAME])] },
          { date: "2024-05-01", categories: [category("a_may", "master/2024/a/may.tsv", [NAME])] },
          { date: "2023-05-01", categories: [category("a_old", "master/2023/a/old.tsv", [NAME])] },
        ],
      },
      { id: "b", editions: [{ date: "2024-05-01", categories: [category("b_od", "master/2024/b/od.tsv", [NAME])] }] },
    ],
    {
      "master/2024/a/sep.tsv": "氏名\nSep\n",
      "master/2024/a/may.tsv": "氏名\nMay\n",
      "master/2023/a/old.tsv": "氏名\nOld\n",
      "master/2024/b/od.tsv": "氏名\nB\n",
    },
  );

  test("a year keeps every Edition of that year; a full date keeps one", () => {
    expect(readCategories(repo, { eventId: "a", date: "2024" }).editions.map((e) => e.key)).toEqual(["a/2024-09-01", "a/2024-05-01"]);
    const one = readCategories(repo, { eventId: "a", date: "2024-05-01" });
    expect(one.categories.map((c) => c.key)).toEqual(["a/2024-05-01/a_may"]);
    expect(one.cells("name").map((c) => c.value)).toEqual(["May"]);
    expect(readCategories(repo, { date: "2024-05" }).categories.map((c) => c.key)).toEqual([
      "a/2024-05-01/a_may",
      "b/2024-05-01/b_od",
    ]);
  });

  test("the same repo object gives the same Category objects; a new repo object reads afresh", () => {
    const [first] = readCategories(repo, { eventId: "b" }).categories;
    expect(readCategories(repo).categories).toContain(first);
    expect(first.rows[0].get("name")).toBe("B");
    repo.writeText("master/2024/b/od.tsv", "氏名\nChanged\n");
    expect(readCategories(repo, { eventId: "b" }).categories[0].rows[0].get("name")).toBe("B");
    const [fresh] = readCategories(memoryRepo(repo.files()), { eventId: "b" }).categories;
    expect(fresh.rows[0].get("name")).toBe("Changed");
  });

  test("a missing or invalid race-info.json throws", () => {
    expect(() => readCategories(memoryRepo({}))).toThrow("race-info.json not found");
    expect(() => readCategories(memoryRepo({ "race-info.json": "{" }))).toThrow("not valid JSON");
  });
});

describe("rewriteCells", () => {
  const repo = repoWith(
    [{ id: "a", editions: [{ date: "2024-05-01", categories: [category("a_od", "master/2024/a/od.tsv", [NAME, { header: "区分", role: "age_category" }])] }] }],
    { "master/2024/a/od.tsv": "氏名\t区分\tメモ\r\n山田 太郎\t男子25-29歳\t a \r\n\r\n佐藤 花子\tF30-34\t\r\n" },
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
