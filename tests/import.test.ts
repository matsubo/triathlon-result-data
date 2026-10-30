import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runImport } from "../scripts/lib/import.js";
import { memoryRepo } from "../scripts/lib/repo.js";
import { fixtureSource } from "../scripts/lib/results-sources/fixture.js";
import { ironmanSource } from "../scripts/lib/results-sources/ironman.js";
import { jtuSource } from "../scripts/lib/results-sources/jtu.js";
import { preparedSource } from "../scripts/lib/results-sources/prepared.js";

const repoRoot = resolve(import.meta.dirname, "..");
const FIXTURES = join(import.meta.dirname, "fixtures/import");
const SCHEMA = readFileSync(join(repoRoot, "race-info-schema.json"), "utf8");

// ---- builders ----------------------------------------------------------

const IM_HEADERS = [
  "ContactId",
  "Overall_Rank",
  "Name",
  "Gender",
  "Division",
  "Div_Rank",
  "Total_Time",
  "Swim",
  "T1",
  "Bike",
  "T2",
  "Run",
  "Country",
  "Status",
];
const IM_META = [
  { header: "ContactId", role: "athlete_id" },
  { header: "Overall_Rank", role: "overall_rank" },
  { header: "Name", role: "name" },
  { header: "Gender", role: "gender" },
  { header: "Division", role: "age_category" },
  { header: "Div_Rank", role: "age_rank" },
  { header: "Total_Time", role: "total_time" },
  { header: "Country", role: "residence" },
  { header: "Status", role: "status" },
];

type Row = {
  rank: string;
  name: string;
  div?: string;
  total: string;
  swim?: string;
  country?: string;
  status?: string;
};

/** An IRONMAN-shaped 70.3 SourceTable, as the IRONMAN adapter returns it. */
function im703(rows: Row[], name = "Half Distance") {
  return {
    headers: IM_HEADERS,
    rows: rows.map((r, i) => [
      `c${i}`,
      r.rank,
      r.name,
      "M",
      r.div ?? "M30-34",
      r.rank === "99999" ? "99999" : "1",
      r.total,
      r.swim ?? (r.total ? "0:30:00" : ""),
      "",
      r.total ? "2:30:00" : "",
      "",
      r.total ? "1:40:00" : "",
      r.country ?? "Japan",
      r.status ?? "",
    ]),
    columns: [
      ...IM_META.slice(0, 7),
      { header: "Swim", role: "lap", sport: "swim" },
      { header: "Bike", role: "lap", sport: "bike" },
      { header: "Run", role: "lap", sport: "run" },
      ...IM_META.slice(7),
    ],
    unmapped: ["T1", "T2"],
    source_url: null,
    segments: [
      { sport: "swim", distance: 1.9 },
      { sport: "bike", distance: 90 },
      { sport: "run", distance: 21.1 },
    ],
    name,
    distance_class: "MD" as const,
  };
}

const ROWS: Row[] = [
  { rank: "1", name: "Ｔａｒｏ　 Yamada", total: "4:45:00" },
  { rank: "2", name: "Jiro  Sato", total: "4:50:00" },
  { rank: "3", name: "Hanako Suzuki", total: "5:10:00" },
  { rank: "99999", name: "Ken Ito", total: "", status: "DNF" },
];

function tsvOf(table: { headers: string[]; rows: string[][] }) {
  return `${[table.headers, ...table.rows].map((r) => r.join("\t")).join("\n")}\n`;
}

function im703Category(event: string, year: string, uuid: string) {
  return {
    id: `${event}_${year}`,
    result_tsv: `master/${year}/${event}_${year}/default.tsv`,
    name: "Half Distance",
    distance: "MD",
    description: `${event} ${year}`,
    segments: [
      { sport: "swim", distance: 1.9, columns: [{ header: "Swim", role: "lap" }] },
      { sport: "bike", distance: 90, columns: [{ header: "Bike", role: "lap" }] },
      { sport: "run", distance: 21.1, columns: [{ header: "Run", role: "lap" }] },
    ],
    meta_columns: IM_META,
    source_url: null,
    source_ref: { results_source: "ironman", id: uuid },
  };
}

function event(id: string, editions: unknown[], extra: object = {}) {
  return {
    id,
    name: `IRONMAN 70.3 ${id}`,
    location: "Somewhere, Japan",
    location_parts: { country: "JP" },
    image: `images/${id}.webp`,
    source: "https://example.com/",
    editions,
    ...extra,
  };
}

function seed(events: unknown[], files: Record<string, string> = {}) {
  return memoryRepo({
    "race-info.json": `${JSON.stringify({ events }, null, 2)}\n`,
    "race-info-schema.json": SCHEMA,
    ...files,
  });
}

const raceInfo = (repo: { readText: (p: string) => string | null }) =>
  JSON.parse(repo.readText("race-info.json") as string);

// ---- tests -------------------------------------------------------------

describe("runImport: IRONMAN add", () => {
  test("a 70.3 Edition with defaults: conventions, template inference, name cleanup", async () => {
    const repo = seed([
      event("im703_x", [{ date: "2025-06-01", categories: [im703Category("im703_x", "2025", "old")] }]),
    ]);
    const ironman = fixtureSource({ "uuid-1": im703(ROWS) });
    const report = await runImport(
      { editions: [{ event: "im703_x", date: "2026-06-07", ironman: "uuid-1" }] },
      { sources: { ironman }, repo },
    );

    expect(report.exit_code).toBe(0);
    expect(report.editions[0].status).toBe("imported");
    expect(ironman.requests).toEqual([{ id: "uuid-1", template: "70.3" }]);
    expect(report.written).toEqual([
      "master/2026/im703_x_2026/default.tsv",
      "race-info.json",
    ]);

    const [ed] = raceInfo(repo).events[0].editions;
    expect(ed).toEqual({
      date: "2026-06-07",
      weather_file: "master/2026/im703_x_2026/weather-data.json",
      categories: [
        {
          ...im703Category("im703_x", "2026", "uuid-1"),
          description: "IRONMAN 70.3 im703_x 2026. Somewhere, Japan.",
        },
      ],
    });

    const tsv = repo.readText("master/2026/im703_x_2026/default.tsv") as string;
    const names = tsv.split("\n").slice(1, 3).map((l) => l.split("\t")[2]);
    expect(names).toEqual(["Taro Yamada", "Jiro Sato"]);
    expect(repo.readText("race-info.json")).toBe(
      `${JSON.stringify(raceInfo(repo), null, 2)}\n`,
    );
  });

  test("the IRONMAN adapter replays a recorded payload into the committed TSV bytes", async () => {
    const payload = readFileSync(join(FIXTURES, "ironman-im703-porec-2026.json"), "utf8");
    const urls: string[] = [];
    const ironman = ironmanSource({
      delayMs: 0,
      fetch: (async (url: string) => {
        urls.push(url);
        return new Response(payload);
      }) as unknown as typeof fetch,
    });
    const repo = seed([
      event("im703_porec", [{ date: "2025-10-19", categories: [im703Category("im703_porec", "2025", "old")] }]),
    ]);
    const report = await runImport(
      { editions: [{ event: "im703_porec", date: "2026-10-18", ironman: "ace7b6b3" }] },
      { sources: { ironman }, repo },
    );

    expect(report.exit_code).toBe(0);
    expect(urls).toEqual(["https://labs-v2.competitor.com/api/results?wtc_eventid=ace7b6b3"]);
    expect(repo.readText("master/2026/im703_porec_2026/default.tsv")).toBe(
      [
        "ContactId\tOverall_Rank\tName\tGender\tDivision\tDiv_Rank\tTotal_Time\tSwim\tT1\tBike\tT2\tRun\tCountry\tStatus",
        "73844bee-34e5-ed11-a7c7-000d3a314329\t1\tArthur Soler\tM\tM25-29\t1\t4:00:39\t0:27:29\t0:03:09\t2:10:55\t0:02:03\t1:17:04\tFrance\t",
        "0d7f0ef5-8c73-45fa-9802-0c485cc0b80b\t2\tVictor Soler\tM\tM18-24\t1\t4:01:39\t0:28:29\t0:03:11\t2:09:44\t0:01:57\t1:18:19\tFrance\t",
        "ede8f8d9-0f56-40ac-b975-42a65dd2ecff\t3\tNiklas Hornshøj\tM\tM30-34\t1\t4:03:43\t0:27:09\t0:02:45\t2:09:55\t0:01:58\t1:21:55\tDenmark\t",
        "68311211-5a05-eb11-a813-000d3a5a1bfb\t99999\tLars Aarts\tM\tM50-54\t99999\t\t0:36:35\t0:04:35\t2:25:42\t0:15:17\t\tNetherlands\tDNF",
        "e52b3b75-3a7c-ef11-a670-000d3a3126fd\t99999\tManuela Boccia\tF\tF40-44\t99999\t\t\t\t\t\t\tItaly\tDNS",
        "875bf874-c0f1-4822-a530-fe3bdfbf74a3\t99999\tMauro Secco\tM\tPC/ID\t99999\t6:19:34\t0:38:25\t0:06:25\t3:11:11\t0:05:01\t2:18:32\tItaly\t",
        "b97be266-fed9-f011-8543-6045bd01aedd\t99999\tJan Vukovich\tM\tM25-29\t99999\t\t\t\t\t\t\tAustria\tDQ",
        "",
      ].join("\n"),
    );
  });

  test("a new Event is inserted before insert_before and needs an explicit template", async () => {
    const repo = seed(
      [
        event("im703_a", [{ date: "2025-06-01", categories: [im703Category("im703_a", "2025", "a")] }]),
        event("im703_b", [{ date: "2025-06-01", categories: [im703Category("im703_b", "2025", "b")] }]),
      ],
      { "images/ironman_new.webp": "webp" },
    );
    const newEvent = {
      id: "ironman_new",
      name: "IRONMAN New",
      location: "Newtown, Japan",
      location_parts: { country: "JP", city: "Newtown" },
      image: "images/ironman_new.webp",
      source: "https://example.com/new",
      insert_before: "im703_b",
    };
    const sources = { ironman: fixtureSource({ "u-new": im703(ROWS, "Full Distance") }) };

    const noTemplate = await runImport(
      { events: [newEvent], editions: [{ event: "ironman_new", date: "2026-07-01", ironman: "u-new" }] },
      { sources, repo },
    );
    expect(noTemplate.exit_code).toBe(2);
    expect(noTemplate.editions[0].reason).toContain("set ironman.template");
    expect(noTemplate.written).toEqual([]);

    const report = await runImport(
      {
        events: [newEvent],
        editions: [
          { event: "ironman_new", date: "2026-07-01", ironman: { id: "u-new", template: "full" }, weather: false },
        ],
      },
      { sources, repo },
    );
    expect(report.exit_code).toBe(0);
    const events = raceInfo(repo).events;
    expect(events.map((e: { id: string }) => e.id)).toEqual(["im703_a", "ironman_new", "im703_b"]);
    const created = events[1];
    expect(Object.keys(created)).toEqual([
      "id",
      "name",
      "location",
      "location_parts",
      "image",
      "source",
      "editions",
    ]);
    expect(created.editions[0].weather_file).toBeUndefined();
    expect(created.editions[0].categories[0].id).toBe("ironman_new_2026");
  });

  test("a new Event whose image is missing or whose name duplicates an Event makes the plan invalid", async () => {
    const repo = seed([event("im703_a", [{ date: "2025-06-01", categories: [im703Category("im703_a", "2025", "a")] }])]);
    const report = await runImport(
      {
        events: [
          {
            id: "im703_a_again",
            name: "IRONMAN 70.3 IM703_A",
            location_parts: { country: "JP" },
            image: "images/missing.webp",
            source: "https://example.com/",
          },
        ],
        editions: [{ event: "im703_a_again", date: "2026-07-01", ironman: "u" }],
      },
      { sources: {}, repo },
    );
    expect(report.exit_code).toBe(1);
    expect(report.plan_errors.join("\n")).toContain("duplicates Event im703_a");
    expect(report.plan_errors.join("\n")).toContain("images/missing.webp does not exist");

    const bad = await runImport({ editions: [{ event: "x", date: "2026-7-1", ironman: "u" }] }, { sources: {}, repo });
    expect(bad.exit_code).toBe(1);
  });

  test("a cancelled swim is expressed by omitting swim from segments", async () => {
    const noSwim = ROWS.map((r) => ({ ...r, swim: "" }));
    const plan = (uuid: string) => ({
      editions: [
        {
          event: "im703_x",
          date: "2026-06-07",
          ironman: {
            id: uuid,
            description: "Swim was cancelled.",
            segments: [
              { sport: "bike" as const, distance: 90 },
              { sport: "run" as const, distance: 21.1 },
            ],
          },
        },
      ],
    });
    const sources = {
      ironman: fixtureSource({ empty: im703(noSwim), filled: im703(ROWS) }),
    };
    const fresh = () =>
      seed([event("im703_x", [{ date: "2025-06-01", categories: [im703Category("im703_x", "2025", "old")] }])]);

    const repo = fresh();
    const ok = await runImport(plan("empty"), { sources, repo });
    expect(ok.exit_code).toBe(0);
    const cat = raceInfo(repo).events[0].editions[0].categories[0];
    expect(cat.segments).toEqual([
      { sport: "bike", distance: 90, columns: [{ header: "Bike", role: "lap" }] },
      { sport: "run", distance: 21.1, columns: [{ header: "Run", role: "lap" }] },
    ]);
    expect(cat.description).toBe("Swim was cancelled.");

    const refused = await runImport(plan("filled"), { sources, repo: fresh() });
    expect(refused.exit_code).toBe(2);
    expect(refused.editions[0].reason).toContain("swim is omitted from the Segments but Swim has 3 non-empty cells");
  });

  test("a declared swim with no finisher swim split is refused", async () => {
    const repo = seed([event("im703_x", [{ date: "2025-06-01", categories: [im703Category("im703_x", "2025", "old")] }])]);
    const report = await runImport(
      { editions: [{ event: "im703_x", date: "2026-06-07", ironman: "u" }] },
      { sources: { ironman: fixtureSource({ u: im703(ROWS.map((r) => ({ ...r, swim: "" }))) }) }, repo },
    );
    expect(report.editions[0].reason).toContain("Swim (swim lap) is empty for every finisher");
  });

  test("PRO-only results are refused", async () => {
    const repo = seed([event("im703_x", [{ date: "2025-06-01", categories: [im703Category("im703_x", "2025", "old")] }])]);
    const pro = ROWS.map((r) => ({ ...r, div: "MPRO" }));
    const report = await runImport(
      { editions: [{ event: "im703_x", date: "2026-06-07", ironman: "u" }] },
      { sources: { ironman: fixtureSource({ u: im703(pro) }) }, repo },
    );
    expect(report.editions[0].reason).toContain("PRO-only results (4 of 4 rows are PRO)");
  });

  test("Age category labels are written canonical, except a label contradicting the Athlete's age", async () => {
    const repo = seed([event("im703_x", [{ date: "2025-06-01", categories: [im703Category("im703_x", "2025", "old")] }])]);
    const t = im703(ROWS);
    const labels = ["男子30-34歳", "30-34男子", "男子30-34歳", "女子24歳以下"];
    const ages = ["31", "35", "52", ""];
    const table = {
      ...t,
      headers: [...t.headers, "Age"],
      rows: t.rows.map((r, i) => [...r.slice(0, 4), labels[i], ...r.slice(5), ages[i]]),
      columns: [...t.columns, { header: "Age", role: "age" }],
    };
    const report = await runImport(
      { editions: [{ event: "im703_x", date: "2026-06-07", ironman: "u" }] },
      { sources: { ironman: fixtureSource({ u: table }) }, repo },
    );
    expect(report.exit_code).toBe(0);
    const tsv = repo.readText("master/2026/im703_x_2026/default.tsv") as string;
    const division = tsv.split("\n")[0].split("\t").indexOf("Division");
    expect(tsv.trim().split("\n").slice(1).map((l) => l.split("\t")[division])).toEqual([
      "M30-34",
      "M30-34",
      "男子30-34歳",
      "F0-24",
    ]);
  });
});

describe("runImport: failure handling", () => {
  test("a failing Edition is skipped with its reason, the others are written, exit 2; a re-run is already-imported", async () => {
    const repo = seed([
      event("im703_x", [{ date: "2025-06-01", categories: [im703Category("im703_x", "2025", "x")] }]),
      event("im703_y", [{ date: "2025-06-01", categories: [im703Category("im703_y", "2025", "y")] }]),
    ]);
    const sources = {
      ironman: fixtureSource({ ok: im703(ROWS), broken: new Error("HTTP 500") }),
    };
    const plan = {
      editions: [
        { event: "im703_x", date: "2026-06-07", ironman: "broken" },
        { event: "im703_y", date: "2026-06-07", ironman: "ok" },
      ],
    };
    const first = await runImport(plan, { sources, repo });
    expect(first.exit_code).toBe(2);
    expect(first.editions.map((e) => e.status)).toEqual(["skipped", "imported"]);
    expect(first.editions[0].reason).toBe("im703_x_2026: ironman fetch failed: HTTP 500");
    expect(first.written).toEqual(["master/2026/im703_y_2026/default.tsv", "race-info.json"]);

    const again = await runImport(
      { editions: [{ event: "im703_y", date: "2026-06-07", ironman: "ok" }] },
      { sources, repo },
    );
    expect(again.exit_code).toBe(0);
    expect(again.editions[0].status).toBe("already-imported");
    expect(again.written).toEqual([]);

    const other = await runImport(
      { editions: [{ event: "im703_y", date: "2026-06-07", ironman: "different" }] },
      { sources, repo },
    );
    expect(other.exit_code).toBe(2);
    expect(other.editions[0].reason).toContain("already exists with Source references [ok]");
  });

  test("a dry run keeps every write in memory", async () => {
    const repo = seed([event("im703_x", [{ date: "2025-06-01", categories: [im703Category("im703_x", "2025", "x")] }])]);
    const before = repo.readText("race-info.json");
    const report = await runImport(
      { editions: [{ event: "im703_x", date: "2026-06-07", ironman: "ok" }] },
      { sources: { ironman: fixtureSource({ ok: im703(ROWS) }) }, repo, dryRun: true },
    );
    expect(report.written).toEqual(["master/2026/im703_x_2026/default.tsv", "race-info.json"]);
    expect(repo.readText("race-info.json")).toBe(before);
    expect(repo.readText("master/2026/im703_x_2026/default.tsv")).toBeNull();
  });

  test("a TSV byte-identical to an existing TSV is rejected as contamination", async () => {
    const table = im703(ROWS);
    const repo = seed(
      [event("im703_x", [{ date: "2025-06-01", categories: [im703Category("im703_x", "2025", "x")] }])],
      {
        "master/2026/other/default.tsv": tsvOf({
          headers: table.headers,
          rows: table.rows.map((r) => r.map((v, i) => (i === 2 ? v.replace(/\s+/g, " ").replace("Ｔａｒｏ", "Taro") : v))),
        }),
      },
    );
    const report = await runImport(
      { editions: [{ event: "im703_x", date: "2026-06-07", ironman: "ok" }] },
      { sources: { ironman: fixtureSource({ ok: table }) }, repo },
    );
    expect(report.exit_code).toBe(2);
    expect(report.editions[0].reason).toContain("byte-identical to master/2026/other/default.tsv (contamination)");
  });

  test("an Athlete count drop of more than half is a warning", async () => {
    const big = im703(Array.from({ length: 10 }, (_, i) => ({ rank: String(i + 1), name: `A ${i}`, total: `5:0${i}:00` })));
    const repo = seed(
      [event("im703_x", [{ date: "2025-06-01", categories: [im703Category("im703_x", "2025", "x")] }])],
      { "master/2025/im703_x_2025/default.tsv": tsvOf(big) },
    );
    const report = await runImport(
      { editions: [{ event: "im703_x", date: "2026-06-07", ironman: "ok" }] },
      { sources: { ironman: fixtureSource({ ok: im703(ROWS) }) }, repo },
    );
    expect(report.exit_code).toBe(0);
    expect(report.editions[0].warnings).toEqual([
      "Athlete count dropped from 10 (previous Edition 2025-06-01) to 4, more than 50%",
    ]);
  });
});

describe("runImport: Edition placement", () => {
  const add = async (dates: string[], date: string) => {
    const repo = seed([
      event(
        "im703_x",
        dates.map((d) => ({ date: d, categories: [{ ...im703Category("im703_x", d.slice(0, 4), d), id: `x_${d}`, result_tsv: `master/${d.slice(0, 4)}/x_${d}/default.tsv` }] })),
      ),
    ]);
    const report = await runImport(
      { editions: [{ event: "im703_x", date, ironman: "u" }] },
      { sources: { ironman: fixtureSource({ u: im703(ROWS) }) }, repo },
    );
    expect(report.exit_code).toBe(0);
    return raceInfo(repo).events[0].editions.map((e: { date: string }) => e.date);
  };

  test("follows newest-first order", async () => {
    expect(await add(["2025-06-01", "2023-06-01"], "2024-06-01")).toEqual(["2025-06-01", "2024-06-01", "2023-06-01"]);
    expect(await add(["2025-06-01"], "2026-06-01")).toEqual(["2026-06-01", "2025-06-01"]);
  });

  test("follows oldest-first order", async () => {
    expect(await add(["2023-06-01", "2025-06-01"], "2024-06-01")).toEqual(["2023-06-01", "2024-06-01", "2025-06-01"]);
    expect(await add(["2023-06-01", "2025-06-01"], "2026-06-01")).toEqual(["2023-06-01", "2025-06-01", "2026-06-01"]);
  });
});

describe("runImport: refetch", () => {
  const committedTable = im703(ROWS);
  const committed = tsvOf({
    headers: committedTable.headers,
    rows: committedTable.rows.map((r) => r.map((v, i) => (i === 2 ? v.replace("Ｔａｒｏ　 ", "Taro ").replace("  ", " ") : v))),
  });
  const path = "master/2026/im703_x_2026/default.tsv";
  const fresh = () =>
    seed(
      [event("im703_x", [{ date: "2026-06-07", categories: [im703Category("im703_x", "2026", "u")] }])],
      { [path]: committed },
    );
  const plan = { editions: [{ event: "im703_x", date: "2026-06-07", mode: "refetch" as const }] };

  test("identical bytes are unchanged", async () => {
    const repo = fresh();
    const report = await runImport(plan, { sources: { ironman: fixtureSource({ u: im703(ROWS) }) }, repo });
    expect(report.exit_code).toBe(0);
    expect(report.editions[0].status).toBe("unchanged");
    expect(report.written).toEqual([]);
  });

  test("changed bytes rewrite only the TSV", async () => {
    const repo = fresh();
    const before = repo.readText("race-info.json");
    const changed = ROWS.map((r, i) => (i === 2 ? { ...r, country: "France" } : r));
    const report = await runImport(plan, { sources: { ironman: fixtureSource({ u: im703(changed) }) }, repo });
    expect(report.exit_code).toBe(0);
    expect(report.editions[0].status).toBe("refetched");
    expect(report.editions[0].categories[0]).toMatchObject({ tsv: "written", changed_rows: 1 });
    expect(report.written).toEqual([path]);
    expect(repo.readText(path)).toContain("Hanako Suzuki\tM\tM30-34\t1\t5:10:00\t0:30:00\t\t2:30:00\t\t1:40:00\tFrance");
    expect(repo.readText("race-info.json")).toBe(before);
  });

  test("a degraded rank probe is refused", async () => {
    const repo = fresh();
    const degraded = ROWS.map((r, i) => (i === 2 ? { ...r, rank: "2" } : r));
    const report = await runImport(plan, { sources: { ironman: fixtureSource({ u: im703(degraded) }) }, repo });
    expect(report.exit_code).toBe(2);
    expect(report.editions[0].reason).toBe(
      "im703_x_2026: rank probe degrades (unique ranks 3 → 2, ordering violations 0 → 0)",
    );
    expect(repo.readText(path)).toBe(committed);
  });

  test("a changed header set is refused", async () => {
    const repo = fresh();
    const t = im703(ROWS);
    const renamed = { ...t, headers: t.headers.map((h) => (h === "T1" ? "T1x" : h)), unmapped: ["T1x", "T2"] };
    const report = await runImport(plan, { sources: { ironman: fixtureSource({ u: renamed }) }, repo });
    expect(report.editions[0].reason).toContain("header set changed");
  });

  test("a source's Japanese Age category labels refetch as the committed canonical labels", async () => {
    const repo = fresh();
    const japanese = ROWS.map((r) => ({ ...r, div: "男子30-34歳" }));
    const report = await runImport(plan, { sources: { ironman: fixtureSource({ u: im703(japanese) }) }, repo });
    expect(report.editions[0].status).toBe("unchanged");
    expect(repo.readText(path)).toBe(committed);
  });

  test("PRO-only results refetch over a PRO-only Category, but not over an age-group one", async () => {
    const pro = ROWS.map((r) => ({ ...r, div: "MPRO" }));
    const proTable = im703(pro);
    const proCommitted = tsvOf({ headers: proTable.headers, rows: proTable.rows.map((r) => r.map((v, i) => (i === 2 ? "Pro Athlete" : v))) });
    const proRepo = seed(
      [event("im703_x", [{ date: "2026-06-07", categories: [im703Category("im703_x", "2026", "u")] }])],
      { [path]: proCommitted },
    );
    const ok = await runImport(plan, { sources: { ironman: fixtureSource({ u: proTable }) }, repo: proRepo });
    expect(ok.exit_code).toBe(0);
    expect(ok.editions[0].status).toBe("refetched");

    const partial = await runImport(plan, { sources: { ironman: fixtureSource({ u: proTable }) }, repo: fresh() });
    expect(partial.exit_code).toBe(2);
    expect(partial.editions[0].reason).toBe("im703_x_2026: PRO-only results (4 of 4 rows are PRO)");
  });
});

describe("runImport: JTU add through the JTU adapter", () => {
  const replay = (async (url: string) => {
    const program = url.match(/programs\/(\d+_\d+)\/result_tables$/);
    const table = url.match(/result_table_id%5D=(\d+)$/);
    const file = program
      ? `jtu-program-${program[1]}.json`
      : table
        ? `jtu-results-${table[1]}.json`
        : null;
    if (!file) return new Response("not found", { status: 404 });
    return new Response(readFileSync(join(FIXTURES, file), "utf8"));
  }) as unknown as typeof fetch;

  const jtuCategory = (id: string, file: string, name: string, distance: string) => ({
    id,
    result_tsv: `master/2025/irago/${file}`,
    name,
    distance,
    description: `${name} 2025`,
    segments: [
      { sport: "swim", distance: 1, columns: [{ header: "ｽｲﾑﾗｯﾌﾟ", role: "lap" }] },
      { sport: "bike", distance: 1, columns: [{ header: "ﾊﾞｲｸﾗｯﾌﾟ", role: "lap" }] },
      { sport: "run", distance: 1, columns: [{ header: "ﾗﾝﾗｯﾌﾟ", role: "lap" }] },
    ],
    meta_columns: [{ header: "氏名", role: "name" }],
    source_url: null,
  });

  test("three programs: id / file / name inferred from the previous Edition, roles from the caption vocabulary", async () => {
    const repo = seed([
      {
        ...event("irago", [
          {
            date: "2025-09-14",
            weather_file: "master/2025/irago/weather-data.json",
            categories: [
              jtuCategory("irago_a", "a.tsv", "Aタイプ（ミドル）", "MD"),
              jtuCategory("irago_b", "b.tsv", "Bタイプ（スタンダード）", "OD"),
              jtuCategory("irago_c", "c.tsv", "Cタイプ（スプリント）", "SD"),
            ],
          },
        ]),
        name: "トライアスロン伊良湖大会",
      },
    ]);
    const report = await runImport(
      {
        editions: [
          {
            event: "irago",
            date: "2026-09-06",
            jtu: [
              {
                program: "422_1",
                distance: "MD",
                description: "A",
                segments: [
                  { sport: "swim", distance: 2.25 },
                  { sport: "bike", distance: 74.7 },
                  { sport: "run", distance: 18 },
                ],
              },
              { program: "422_2", distance: "OD", description: "B" },
              { program: "422_3", distance: "SD", description: "C" },
            ],
          },
        ],
      },
      { sources: { jtu: jtuSource({ fetch: replay }) }, repo },
    );

    expect(report.exit_code).toBe(0);
    expect(report.editions[0].categories.map((c) => [c.id, c.result_tsv, c.rows])).toEqual([
      ["irago_a", "master/2026/irago/a.tsv", 4],
      ["irago_b", "master/2026/irago/b.tsv", 4],
      ["irago_c", "master/2026/irago/c.tsv", 4],
    ]);
    const [ed] = raceInfo(repo).events[0].editions;
    expect(ed.date).toBe("2026-09-06");
    expect(ed.weather_file).toBe("master/2026/irago/weather-data.json");
    const [a, b, c] = ed.categories;
    expect([a.name, b.name, c.name]).toEqual(["Aタイプ（ミドル）", "Bタイプ（スタンダード）", "Cタイプ（スプリント）"]);
    expect(a.source_ref).toEqual({ results_source: "jtu", id: "422_1" });
    expect(a.source_url).toBe("https://results.jtu.or.jp/api/results?cond[result_table_id]=4596");
    expect(a.segments.map((s: { distance: number }) => s.distance)).toEqual([2.25, 74.7, 18]);
    expect(b.segments.map((s: { distance: number }) => s.distance)).toEqual([1.5, 40, 10]);
    expect(c.segments.map((s: { distance: number }) => s.distance)).toEqual([0.75, 20, 5]);
    expect(a.meta_columns).toEqual([
      { header: "総合順位", role: "overall_rank" },
      { header: "No.", role: "bib" },
      { header: "氏名", role: "name" },
      { header: "年齢", role: "age" },
      { header: "性別", role: "gender" },
      { header: "登録地", role: "residence" },
      { header: "総合記録", role: "total_time" },
      { header: "PNLT", role: "penalty" },
      { header: "男子順位", role: "gender_rank" },
      { header: "女子順位", role: "gender_rank" },
      { header: "年齢区分", role: "age_category" },
      { header: "年齡別順", role: "age_rank" },
    ]);
    expect(a.segments[1].columns).toEqual([
      { header: "ﾊﾞｲｸﾗｯﾌﾟ", role: "lap" },
      { header: "Ｂ順", role: "rank" },
      { header: "ｽﾌﾟﾘｯﾄ", role: "cumulative_time" },
      { header: "通過", role: "cumulative_rank" },
    ]);
    const tsv = repo.readText("master/2026/irago/a.tsv") as string;
    expect(tsv.split("\n")[0]).toBe(
      "総合順位\tNo.\t氏名\t年齢\t性別\t登録地\t総合記録\tｽｲﾑﾗｯﾌﾟ\tＳ順\tﾊﾞｲｸﾗｯﾌﾟ\tＢ順\tｽﾌﾟﾘｯﾄ\t通過\tﾗﾝﾗｯﾌﾟ\tＲ順\tPNLT\t男子順位\t女子順位\t年齢区分\t年齡別順",
    );
    expect(tsv.split("\n")[1]).toBe(
      "1\t1\t前田 能宜\t27\t男\t愛知県\t3:26:50\t0:32:08\t3\t1:45:19\t1\t2:17:27\t1\t1:09:23\t1\t\t1\t\tM25-29\t",
    );
  });

  test("column options rename, drop and add constants; an unknown caption is an error", async () => {
    const repo = seed([
      { ...event("irago", [{ date: "2025-09-14", categories: [jtuCategory("irago_b", "b.tsv", "B", "OD")] }]), name: "伊良湖" },
    ]);
    const plan = (columns: object) => ({
      editions: [
        { event: "irago", date: "2026-09-06", jtu: [{ program: "422_2", distance: "OD" as const, description: "B", columns }] },
      ],
    });
    const sources = { jtu: jtuSource({ fetch: replay }) };

    const ok = await runImport(
      plan({ rename: { PNLT: "ペナルティ" }, drop: ["Ｒ順"], constants: [{ header: "種別", value: "エイジ", after: "性別" }] }),
      { sources, repo },
    );
    expect(ok.exit_code).toBe(0);
    const header = (repo.readText("master/2026/irago/b.tsv") as string).split("\n")[0].split("\t");
    expect(header.slice(3, 7)).toEqual(["年齢", "性別", "種別", "居住地"]);
    expect(header).toContain("ペナルティ");
    expect(header).not.toContain("Ｒ順");
    const cat = raceInfo(repo).events[0].editions[0].categories[0];
    expect(cat.meta_columns).toContainEqual({ header: "種別", role: "note" });
    expect(cat.meta_columns).toContainEqual({ header: "ペナルティ", role: "penalty" });

    const unknown = await runImport(plan({ rename: { PNLT: "謎の列" } }), { sources, repo: seed([
      { ...event("irago", [{ date: "2025-09-14", categories: [jtuCategory("irago_b", "b.tsv", "B", "OD")] }]), name: "伊良湖" },
    ]) });
    expect(unknown.exit_code).toBe(2);
    expect(unknown.editions[0].reason).toContain('unknown JTU caption "謎の列"; rename or drop it');
  });

  test("a table whose captions repeat is refused", async () => {
    // A duathlon table captions both run legs' ranks Ｒ順; written as is,
    // the Category would read only the last one.
    const repeating = (async (url: string) => {
      const res = await replay(url);
      if (!url.includes("result_table_id")) return res;
      const json = await res.json();
      for (const c of json.res.body.result_cols) if (c.result_col_caption === "Ｓ順") c.result_col_caption = "Ｒ順";
      return new Response(JSON.stringify(json));
    }) as unknown as typeof fetch;
    const repo = seed([
      { ...event("irago", [{ date: "2025-09-14", categories: [jtuCategory("irago_b", "b.tsv", "B", "OD")] }]), name: "伊良湖" },
    ]);
    const report = await runImport(
      { editions: [{ event: "irago", date: "2026-09-06", jtu: [{ program: "422_2", distance: "OD", description: "B" }] }] },
      { sources: { jtu: jtuSource({ fetch: repeating }) }, repo },
    );
    expect(report.exit_code).toBe(2);
    expect(report.editions[0].reason).toBe("irago_b: duplicate headers Ｒ順");
    expect(report.written).toEqual([]);
  });
});

describe("runImport: prepared TSV", () => {
  test("columns come from the plan, and a repeated sport keeps its own Segment", async () => {
    const tsv = [
      "順位\t氏名\t記録\t第1ラン\tバイク\t第2ラン\t備考",
      "1\t山田　太郎\t1:10:00\t0:15:00\t0:35:00\t0:20:00\t",
      "DNF\t佐藤 花子\t\t0:18:00\t\t\t",
      "",
    ].join("\n");
    const prepared = preparedSource({
      readFile: (path) => {
        if (path !== "/tmp/du.tsv") throw new Error(`unexpected ${path}`);
        return tsv;
      },
    });
    const repo = seed([
      { ...event("du", [{ date: "2025-03-01", categories: [im703Category("du", "2025", "x")] }]), name: "デュアスロン大会" },
    ]);
    const report = await runImport(
      {
        editions: [
          {
            event: "du",
            date: "2026-03-01",
            weather: false,
            prepared: [
              {
                tsv: "/tmp/du.tsv",
                id: "du",
                file: "default.tsv",
                name: "デュアスロン",
                distance: "DUATHLON",
                description: "2026年デュアスロン大会",
                segments: [
                  { sport: "run", distance: 5, columns: [{ header: "第1ラン", role: "lap" }] },
                  { sport: "bike", distance: 20, columns: [{ header: "バイク", role: "lap" }] },
                  { sport: "run", distance: 2.5, columns: [{ header: "第2ラン", role: "lap" }] },
                ],
                meta_columns: [
                  { header: "順位", role: "overall_rank" },
                  { header: "氏名", role: "name" },
                  { header: "記録", role: "total_time" },
                ],
                unmapped: ["備考"],
              },
            ],
          },
        ],
      },
      { sources: { prepared }, repo },
    );

    expect(report.exit_code).toBe(0);
    const [ed] = raceInfo(repo).events[0].editions;
    expect(ed.categories[0].segments.map((s: { sport: string; columns: { header: string }[] }) => [s.sport, s.columns[0].header])).toEqual([
      ["run", "第1ラン"],
      ["bike", "バイク"],
      ["run", "第2ラン"],
    ]);
    expect(ed.categories[0].source_ref).toBeUndefined();
    expect(repo.readText("master/2026/du/default.tsv")).toBe(tsv.replace("山田　太郎", "山田 太郎"));
  });
});
