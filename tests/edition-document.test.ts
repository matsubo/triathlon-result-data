import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { UnknownColumnRole } from "../scripts/lib/build-athlete.js";
import {
  AmbiguousEdition,
  EditionNotFound,
  editionDocument,
  SchemaInvalid,
} from "../scripts/lib/edition-document.js";
import { memoryRepo, type Repo } from "../scripts/lib/repo.js";

type Col = { header: string; role: string };

const TSV = "master/2024/ev/od.tsv";

function edition(meta: Col[], swim: Col[] = [], extra: object = {}) {
  return {
    date: "2024-06-02",
    categories: [
      {
        id: "ev_od",
        result_tsv: TSV,
        name: "OD",
        distance: "OD",
        description: "Olympic",
        segments: [
          { sport: "swim", distance: 1.5, columns: swim },
          { sport: "run", distance: 10, columns: [] },
        ],
        meta_columns: meta,
        ...extra,
      },
    ],
  };
}

function repoOf(editions: unknown[], files: Record<string, string>) {
  return memoryRepo({
    "race-info.json": JSON.stringify({ events: [{ id: "ev", name: "Ev", location: "Somewhere", editions }] }),
    ...files,
  });
}

/** One-Edition repo whose TSV is the given header + rows. */
function single(meta: Col[], rows: string[][], swim: Col[] = []) {
  const headers = [...meta, ...swim].map((c) => c.header);
  const text = [headers, ...rows].map((r) => r.join("\t")).join("\n");
  return repoOf([edition(meta, swim)], { [TSV]: `${text}\n` });
}

const athletes = (repo: Repo) =>
  editionDocument(repo, "ev", "2024").document.categories[0].athletes;

const RANK = { header: "Rank", role: "overall_rank" };
const NAME = { header: "Name", role: "name" };
const TOTAL = { header: "Total", role: "total_time" };

describe("editionDocument: the Edition document", () => {
  test("builds the exact output object from race-info and the TSV", () => {
    const repo = single(
      [RANK, NAME, TOTAL, { header: "Country", role: "residence" }],
      [["1", "Taro Yamada", "2:01:02", "JPN"]],
      [{ header: "Swim", role: "lap" }],
    );
    const { document, warnings } = editionDocument(repo, "ev", "2024-06-02");
    expect(warnings).toEqual([]);
    expect(document).toEqual({
      event_id: "ev",
      name: "Ev",
      location: "Somewhere",
      date: "2024-06-02",
      weather: null,
      categories: [
        {
          id: "ev_od",
          name: "OD",
          distance: "OD",
          description: "Olympic",
          segments: [
            { sport: "swim", distance_km: 1.5 },
            { sport: "run", distance_km: 10 },
          ],
          athletes: [
            {
              rank: 1,
              status: "finished",
              bib: "",
              name: "Taro Yamada",
              age: null,
              gender: null,
              residence: "JP",
              total_time_seconds: 7262,
              age_group: null,
              age_category_raw: null,
              rankings: { gender: null, age_group: null },
              segments: [{}, {}],
            },
          ],
        },
      ],
    });
  });

  test("the 99999 placeholder rank: an unranked finisher with a total time, DNS without", () => {
    const repo = single([RANK, NAME, TOTAL], [
      ["99999", "With Time", "4:00:00"],
      ["99999", "Without Time", ""],
    ]);
    expect(athletes(repo).map((a) => [a.name, a.rank, a.status])).toEqual([
      ["With Time", null, "OPEN"],
      ["Without Time", null, "DNS"],
    ]);
  });

  test("a status column wins over the status the rank cell implies", () => {
    const repo = single([RANK, NAME, TOTAL, { header: "Status", role: "status" }], [
      ["12", "Disqualified", "4:00:00", "DQ"],
      ["13", "Confirmed", "4:01:00", "FIN"],
    ]);
    expect(athletes(repo).map((a) => [a.rank, a.status])).toEqual([
      [null, "DSQ"],
      [13, "finished"],
    ]);
  });

  test("gender_rank takes the first valid rank across its columns", () => {
    const repo = single(
      [RANK, NAME, { header: "男子順位", role: "gender_rank" }, { header: "女子順位", role: "gender_rank" }],
      [
        ["1", "Man", "1", ""],
        ["2", "Woman", "", "1"],
        ["3", "Placeholder", "99999", "7"],
      ],
    );
    expect(athletes(repo).map((a) => a.rankings.gender)).toEqual([1, 1, 7]);
  });

  test("dropped Column roles never reach the output", () => {
    const dropped = ["championship_rank", "note", "citizen_rank", "citizen_category"].map((role) => ({ header: role, role }));
    const repo = single([RANK, NAME, ...dropped], [["1", "Taro", "5", "memo", "3", "市民"]]);
    const [a] = athletes(repo);
    expect(Object.keys(a)).toEqual([
      "rank",
      "status",
      "bib",
      "name",
      "age",
      "gender",
      "residence",
      "total_time_seconds",
      "age_group",
      "age_category_raw",
      "rankings",
      "segments",
    ]);
    expect(JSON.stringify(a)).not.toMatch(/memo|市民/);
  });

  test("every Column role in race-info-schema.json is handled or dropped", () => {
    const schema = JSON.parse(readFileSync(join(resolve(import.meta.dirname, ".."), "race-info-schema.json"), "utf8"));
    const meta = schema.definitions.MetaColumnRole.enum.map((role: string) => ({ header: `m_${role}`, role }));
    const seg = schema.definitions.SegmentColumnRole.enum.map((role: string) => ({ header: `s_${role}`, role }));
    const repo = single([NAME, ...meta], [["Taro", ...meta.map(() => "1"), ...seg.map(() => "0:10:00")]], seg);
    expect(athletes(repo)).toHaveLength(1);
  });

  test("a Column role that is neither handled nor dropped throws UnknownColumnRole", () => {
    const repo = single([NAME, { header: "Mystery", role: "mystery" }], [["Taro", "x"]]);
    expect(() => editionDocument(repo, "ev", "2024")).toThrow(UnknownColumnRole);
  });

  test("warnings: unmapped headers, then unknown status tokens; a missing TSV is a warning too", () => {
    const repo = repoOf(
      [edition([RANK, NAME, { header: "Age", role: "age" }]), { ...edition([NAME]), date: "2023-06-04" }],
      { [TSV]: "Rank\tName\nDNQ *2\tTaro\nDNF\tJiro\n" },
    );
    expect(editionDocument(repo, "ev", "2024").warnings).toEqual([
      'Header mismatch in master/2024/ev/od.tsv: column "Age" not found in TSV headers',
      'Unknown status token "DNQ *2" in master/2024/ev/od.tsv',
    ]);
    const missing = repoOf([edition([NAME])], {});
    const result = editionDocument(missing, "ev", "2024");
    expect(result.warnings).toEqual(["Result TSV not found: master/2024/ev/od.tsv"]);
    expect(result.document.categories[0].athletes).toEqual([]);
  });

  test("a missing weather file is a warning and null weather", () => {
    const repo = repoOf([{ ...edition([NAME]), weather_file: "master/2024/ev/weather-data.json" }], { [TSV]: "Name\nTaro\n" });
    const { document, warnings } = editionDocument(repo, "ev", "2024");
    expect(document.weather).toBeNull();
    expect(warnings).toEqual(["weather file not found: master/2024/ev/weather-data.json"]);
  });
});

describe("editionDocument: errors", () => {
  test("a year matching two Editions is AmbiguousEdition listing the dates; the full date picks one", () => {
    const repo = repoOf(
      [edition([NAME]), { ...edition([NAME]), date: "2024-10-06" }],
      { [TSV]: "Name\nTaro\n" },
    );
    let error: unknown;
    try {
      editionDocument(repo, "ev", "2024");
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(AmbiguousEdition);
    expect((error as AmbiguousEdition).dates).toEqual(["2024-06-02", "2024-10-06"]);
    expect(editionDocument(repo, "ev", "2024-10-06").document.date).toBe("2024-10-06");
  });

  test("no matching Edition or Event is EditionNotFound", () => {
    const repo = repoOf([edition([NAME])], { [TSV]: "Name\nTaro\n" });
    expect(() => editionDocument(repo, "ev", "2019")).toThrow(EditionNotFound);
    expect(() => editionDocument(repo, "nope", "2024")).toThrow('event "nope" not found in race-info.json');
  });

  test("a document failing result-schema.json is SchemaInvalid with the ajv errors", () => {
    const repo = repoOf([edition([NAME], [], { distance: "MARATHON" })], { [TSV]: "Name\nTaro\n" });
    let error: unknown;
    try {
      editionDocument(repo, "ev", "2024");
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(SchemaInvalid);
    expect((error as SchemaInvalid).errors.map((e) => e.instancePath)).toContain("/categories/0/distance");
  });
});
