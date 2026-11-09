import { describe, expect, test } from "bun:test";
import { readCategories } from "../scripts/lib/category-reader.js";
import { memoryRepo } from "../scripts/lib/repo.js";
import { exceptionProblems, loadExceptions } from "../scripts/lib/exceptions.js";
import {
  checkPace,
  describePace,
  paceWarnings,
  segmentLabel,
  segmentMedians,
  staleExceptions,
} from "../scripts/lib/segment-pace.js";

type Column = { header: string; role: string };
type Segment = { sport: string; distance: number; columns: Column[] };
type CategoryDef = {
  id: string;
  result_tsv: string;
  name: string;
  distance: string;
  description: string;
  segments: Segment[];
  meta_columns: Column[];
};

const META: Column[] = [
  { header: "Rank", role: "overall_rank" },
  { header: "Name", role: "name" },
  { header: "Total", role: "total_time" },
];

function category(id: string, date: string, distance: string, segments: Segment[]): CategoryDef {
  return {
    id,
    result_tsv: `master/${date.slice(0, 4)}/ev/${id}.tsv`,
    name: id,
    distance,
    description: id,
    segments,
    meta_columns: META,
  };
}

/** A TSV of `Rank Name Total` plus the given columns, one row per entry of `rows`. */
function tsv(headers: string[], rows: string[][]) {
  return `${["Rank", "Name", "Total", ...headers].join("\t")}\n${rows
    .map((r, i) => [r[0] ?? String(i + 1), `A ${i}`, ...r.slice(1)].join("\t"))
    .join("\n")}\n`;
}

/** Rows of `n` finishers, each `cells(i)` after the rank: [total, ...headers]. */
const finishers = (n: number, cells: (i: number) => string[]) =>
  Array.from({ length: n }, (_, i) => [String(i + 1), ...cells(i)]);

function repoOf(editions: { date: string; categories: CategoryDef[] }[], files: Record<string, string>) {
  return memoryRepo({
    "race-info.json": JSON.stringify({ events: [{ id: "ev", name: "Ev", editions }] }),
    ...files,
  });
}

const lap = (header: string) => ({ header, role: "lap" });

describe("segmentMedians", () => {
  test("medians come from the lap column, summed lap columns or summed checkpoints, over finishers only", () => {
    const c = category("od", "2025-06-01", "OD", [
      { sport: "swim", distance: 1.5, columns: [lap("Swim")] },
      { sport: "bike", distance: 40, columns: [lap("Bike1"), lap("Bike2")] },
      {
        sport: "run",
        distance: 10,
        columns: [
          { header: "R1", role: "checkpoint" },
          { header: "R2", role: "checkpoint" },
        ],
      },
    ]);
    const rows = [
      ...finishers(5, (i) => ["2:30:00", `0:3${i}:00`, "0:40:00", `0:3${i}:00`, "0:25:00", `0:2${i}:00`]),
      ["DNF", "", "1:59:00", "", "", "", ""],
    ];
    const repo = repoOf([{ date: "2025-06-01", categories: [c] }], {
      [c.result_tsv]: tsv(["Swim", "Bike1", "Bike2", "R1", "R2"], rows),
    });
    const [cat] = readCategories(repo).categories;
    expect(segmentMedians(cat)).toEqual([
      { index: 0, sport: "swim", km: 1.5, source: "lap", laps: 5, median: 32 * 60, skipped: null },
      { index: 1, sport: "bike", km: 40, source: "lap", laps: 5, median: 72 * 60, skipped: null },
      { index: 2, sport: "run", km: 10, source: "checkpoints", laps: 5, median: 47 * 60, skipped: null },
    ]);
  });

  test("a cumulative-only Segment is the difference of cumulative times; the one unmeasured Segment is the total minus the rest", () => {
    const cumulative = category("cum", "2025-06-01", "SD", [
      { sport: "swim", distance: 0.75, columns: [{ header: "C1", role: "cumulative_time" }] },
      { sport: "bike", distance: 20, columns: [{ header: "C2", role: "cumulative_time" }] },
      { sport: "run", distance: 5, columns: [{ header: "C3", role: "cumulative_time" }] },
    ]);
    const derived = category("gap", "2025-06-01", "OD", [
      { sport: "swim", distance: 1.5, columns: [lap("Swim"), { header: "T1", role: "transition" }] },
      { sport: "bike", distance: 40, columns: [{ header: "T2", role: "transition" }] },
      { sport: "run", distance: 10, columns: [lap("Run")] },
    ]);
    const repo = repoOf([{ date: "2025-06-01", categories: [cumulative, derived] }], {
      [cumulative.result_tsv]: tsv(
        ["C1", "C2", "C3"],
        finishers(5, () => ["1:20:00", "0:15:00", "0:50:00", "1:20:00"]),
      ),
      [derived.result_tsv]: tsv(
        ["Swim", "T1", "T2", "Run"],
        finishers(5, () => ["2:30:00", "0:30:00", "0:02:00", "0:01:00", "0:50:00"]),
      ),
    });
    const [cum, gap] = readCategories(repo).categories;
    expect(segmentMedians(cum).map((s) => [s.source, s.median])).toEqual([
      ["cumulative", 15 * 60],
      ["cumulative", 35 * 60],
      ["cumulative", 30 * 60],
    ]);
    expect(segmentMedians(gap).map((s) => [s.source, s.median])).toEqual([
      ["lap", 30 * 60],
      ["total", 67 * 60],
      ["lap", 50 * 60],
    ]);
  });

  test("Segments without a distance, without a lap column or with fewer than 5 finisher laps are skipped", () => {
    const noLaps = category("nolaps", "2025-06-01", "OD", [
      { sport: "swim", distance: 1.5, columns: [] },
      { sport: "bike", distance: 40, columns: [] },
      { sport: "run", distance: 0, columns: [lap("Run")] },
    ]);
    const few = category("few", "2025-06-01", "SD", [{ sport: "swim", distance: 0.75, columns: [lap("Swim")] }]);
    const repo = repoOf([{ date: "2025-06-01", categories: [noLaps, few] }], {
      [noLaps.result_tsv]: tsv(["Run"], finishers(5, () => ["2:30:00", "0:50:00"])),
      [few.result_tsv]: tsv(["Swim"], finishers(4, () => ["1:20:00", "0:15:00"])),
    });
    const [a, b] = readCategories(repo).categories;
    expect(segmentMedians(a).map((s) => s.skipped)).toEqual(["no lap column", "no lap column", "no distance"]);
    expect(segmentMedians(b).map((s) => s.skipped)).toEqual(["4 finisher laps"]);
    expect(checkPace([a, b])).toEqual([]);
  });
});

describe("checkPace", () => {
  /** One swim-only OD Category per Edition, every finisher on `swim`. */
  function editions(swims: Record<string, string>, extra: Record<string, CategoryDef[]> = {}) {
    const files: Record<string, string> = {};
    const list = Object.entries(swims).map(([date, swim]) => {
      const c = category("od", date, "OD", [{ sport: "swim", distance: 1.5, columns: [lap("Swim")] }]);
      files[c.result_tsv] = tsv(["Swim"], finishers(5, () => ["2:30:00", swim]));
      return { date, categories: [c, ...(extra[date] ?? [])] };
    });
    return { list, files };
  }

  test("a median off the other Editions at the same distance is flagged even when the pace is plausible", () => {
    const { list, files } = editions({ "2026-06-07": "0:22:00", "2025-06-01": "0:35:00", "2024-06-02": "0:36:00" });
    const checks = checkPace(readCategories(repoOf(list, files)).categories);
    const flagged = checks.filter((c) => c.severity > 0);
    expect(flagged.map((c) => c.category.date)).toEqual(["2026-06-07"]);
    const [check] = flagged;
    expect(check.outsideBand).toBe(false);
    expect(check.offEditions).toBe(true);
    expect(check.peers).toBe(2);
    expect(describePace(check)).toBe(
      "od: swim median 22:00 for 1.5 km (1:28/100m; 38% faster than the 35:30 median of 2 other Editions of this Event at 1.5 km; about 0.93 km at this Event's usual pace): check the race-day course",
    );
  });

  test("a pace outside the band is flagged without other Editions; duathlon legs are numbered", () => {
    const du = category("du", "2026-06-07", "DUATHLON", [
      { sport: "run", distance: 5, columns: [lap("Run1")] },
      { sport: "bike", distance: 20, columns: [lap("Bike")] },
      { sport: "run", distance: 2.5, columns: [lap("Run2")] },
    ]);
    const { list, files } = editions({ "2026-06-07": "0:30:00" }, { "2026-06-07": [du] });
    files[du.result_tsv] = tsv(["Run1", "Bike", "Run2"], finishers(5, () => ["1:40:00", "0:20:00", "0:40:00", "0:40:00"]));
    const flagged = checkPace(readCategories(repoOf(list, files)).categories).filter((c) => c.severity > 0);
    expect(flagged.map(describePace)).toEqual([
      "du: run 2 median 40:00 for 2.5 km (16:00/km, outside the plausible 3:10–9:00/km; about 6.63 km at this Event's usual pace): check the race-day course",
    ]);
  });

  test("paceWarnings lists the flagged Segments of one Edition only", () => {
    const { list, files } = editions({ "2025-06-01": "0:35:00", "2024-06-02": "0:12:00" });
    const repo = repoOf(list, files);
    expect(paceWarnings(repo, "ev", "2025-06-01")).toHaveLength(1);
    expect(paceWarnings(repo, "ev", "2024-06-02")).toEqual([
      "od: swim median 12:00 for 1.5 km (0:48/100m, outside the plausible 1:00–4:00/100m; 66% faster than the 35:00 median of 1 other Edition of this Event at 1.5 km; about 0.51 km at this Event's usual pace): check the race-day course",
    ]);
  });
});

describe("pace Exceptions", () => {
  /** Four Editions of a swim-only OD Category; only 2024 (a fast 12:00 at 1.5 km) is flagged. */
  function corpus() {
    const files: Record<string, string> = {};
    const swims = { "2025-06-01": "0:35:00", "2024-06-02": "0:12:00", "2023-06-04": "0:36:00", "2022-06-05": "0:35:30" };
    const list = Object.entries(swims).map(
      ([date, swim]) => {
        const c = category("od", date, "OD", [{ sport: "swim", distance: 1.5, columns: [lap("Swim")] }]);
        files[c.result_tsv] = tsv(["Swim"], finishers(5, () => ["2:30:00", swim]));
        return { date, categories: [c] };
      },
    );
    return repoOf(list, files);
  }
  const entry = (date: string, segment = "1 swim") => ({
    event: "ev",
    date,
    category: "od",
    segment,
    reason: "full swim with a strong current",
    source: "https://example.com/race-report",
  });

  test("an exempted Segment is not flagged, by checkPace or by the Import warning", () => {
    const repo = corpus();
    const exceptions = [entry("2024-06-02")];
    const checks = checkPace(readCategories(repo).categories, exceptions);
    const exempted = checks.find((c) => c.category.date === "2024-06-02");
    expect(exempted?.exception).toBe(exceptions[0]);
    expect(exempted?.severity).toBe(0);
    expect(exempted?.outsideBand).toBe(true);
    expect(segmentLabel(exempted!.segment)).toBe("1 swim");
    expect(checks.filter((c) => c.severity > 0)).toEqual([]);
    expect(staleExceptions(checks, exceptions)).toEqual([]);
    expect(paceWarnings(repo, "ev", "2024-06-02", exceptions)).toEqual([]);
    expect(paceWarnings(repo, "ev", "2024-06-02", [])).toHaveLength(1);
  });

  test("an entry that matches no measured Segment, or names a Segment that is not flagged, is stale", () => {
    const exceptions = [entry("2024-06-02"), entry("2025-06-01"), entry("2024-06-02", "2 bike")];
    const checks = checkPace(readCategories(corpus()).categories, exceptions);
    expect(staleExceptions(checks, exceptions)).toEqual([
      `ev 2025-06-01 od "1 swim": the Segment's pace is no longer flagged; remove the entry`,
      `ev 2024-06-02 od "2 bike": matches no measured Segment`,
    ]);
  });

  test("every entry needs a reason and a source URL; the committed file is valid", () => {
    const { source, ...noSource } = entry("2024-06-02");
    expect(source).toBeTruthy();
    expect(
      exceptionProblems("segment_pace", [
        noSource,
        { ...entry("2024-06-02"), reason: " ", source: "example.com", segment: "swim" },
        entry("2025-06-01"),
        entry("2025-06-01"),
      ]),
    ).toEqual([
      'entries[0]: "source" is required',
      'entries[1]: "reason" is required',
      'entries[1]: "segment" must be "<position> <sport>", e.g. "1 swim"',
      'entries[1]: "source" must be a URL',
      'entries[3]: duplicate entry for ev 2025-06-01 od "1 swim"',
    ]);
    expect(exceptionProblems("segment_pace", loadExceptions("segment_pace"))).toEqual([]);
  });
});
