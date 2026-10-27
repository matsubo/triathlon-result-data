/**
 * Import module: turns an import plan into Editions in race-info.json plus
 * their result TSVs, through two ports.
 *
 * - Results source port (`sources`): `{ fetch(request) → Promise<SourceTable> }`
 *   per Results source (ironman, jtu, prepared). Each adapter owns its own
 *   caption vocabulary, so Column roles cross the port already resolved.
 * - Repo port (`repo`, scripts/lib/repo.js): reads race-info.json, the schemas,
 *   committed TSVs and images; receives the writes.
 *
 * The core owns the conventions (Category ids and paths, Segment distances,
 * source_ref, weather_file), name cleanup, canonical Age category labels,
 * Edition placement, the safety checks and the race-info serialisation. A
 * failing Edition is skipped with its reason and the others are still
 * written: TSVs first, race-info.json once at the end.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import { relabelAgeCategory } from "./normalize-age-category.js";
import { parseTime } from "./normalize-time.js";
import { memoryRepo } from "./repo.js";

/**
 * @typedef {object} SourceColumn
 * @property {string} header TSV header
 * @property {string} role Column role (a meta role, or a segment role when `sport` is set)
 * @property {string} [sport] Segment sport of a segment column
 * @property {number} [segment] index into `SourceTable.segments` when a sport repeats (prepared TSVs)
 *
 * @typedef {object} SourceTable
 * @property {string[]} headers
 * @property {string[][]} rows
 * @property {SourceColumn[]} columns every mapped header with its Column role
 * @property {string[]} unmapped headers kept in the TSV without a Column role
 * @property {string | null} source_url
 * @property {{sport: string, distance: number}[]} [segments] Segments of the course, in order, with km
 * @property {string} [name] Category name
 * @property {import("../../schema.ts").DistanceType} [distance_class]
 *
 * @typedef {{ fetch: (request: any) => Promise<SourceTable> }} ResultsSource
 * @typedef {{ ironman?: ResultsSource, jtu?: ResultsSource, prepared?: ResultsSource }} Sources
 *
 * @typedef {object} CategoryReport
 * @property {string} id
 * @property {string} result_tsv
 * @property {number} rows
 * @property {"written" | "unchanged"} tsv
 * @property {{before: RankProbe, after: RankProbe}} [probe] refetch only
 * @property {number} [changed_rows] refetch only: data rows not present in the committed TSV
 *
 * @typedef {object} EditionReport
 * @property {string} event
 * @property {string} date
 * @property {"add" | "refetch"} mode
 * @property {"imported" | "already-imported" | "refetched" | "unchanged" | "skipped"} status
 * @property {string} [reason] why the Edition was skipped
 * @property {string[]} warnings
 * @property {CategoryReport[]} categories
 *
 * @typedef {object} ImportReport
 * @property {0 | 1 | 2} exit_code 0 = all imported or already imported, 2 = some Editions skipped, 1 = plan invalid
 * @property {boolean} dry_run
 * @property {string[]} plan_errors
 * @property {EditionReport[]} editions
 * @property {string[]} written repo paths written (into memory on a dry run)
 * @property {boolean} race_info_needs_format race-info.json was not in JSON.stringify(…, 2) form; run Biome after writing
 *
 * @typedef {{unique: number, violations: number}} RankProbe
 */

const PLAN_SCHEMA = JSON.parse(
  readFileSync(join(import.meta.dirname, "import-plan-schema.json"), "utf8"),
);

/** Standard Segment km per Distance class, used when neither the plan nor the source gives them. */
/** @type {Record<string, Record<string, number>>} */
const STANDARD_SEGMENTS = {
  LD: { swim: 3.8, bike: 180.2, run: 42.195 },
  MD: { swim: 1.9, bike: 90, run: 21.1 },
  OD: { swim: 1.5, bike: 40, run: 10 },
  SD: { swim: 0.75, bike: 20, run: 5 },
};
const SPORT_ORDER = ["swim", "bike", "run", "trail_running"];
/** Meta roles a Category may map at most once (gender_rank and note may repeat). */
const SINGLE_ROLES = new Set([
  "overall_rank",
  "bib",
  "name",
  "age",
  "gender",
  "residence",
  "total_time",
  "age_category",
  "age_rank",
  "penalty",
  "status",
  "guide_name",
  "citizen_rank",
  "citizen_category",
  "athlete_id",
  "championship_rank",
]);
const PRO_ONLY_SHARE = 0.9;
const COUNT_DROP_WARNING = 0.5;

class Skip extends Error {}

/**
 * Name cleanup for the name role: U+3000 and whitespace runs → one space,
 * full-width Latin letters / digits (and the full-width `．` seen inside
 * romanised names) → half-width, trimmed.
 * @param {string} s
 */
export function cleanName(s) {
  return s
    .replace(/[Ａ-Ｚａ-ｚ０-９．]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Rewrite age_category cells into their canonical Age category label
 * (relabelAgeCategory: 男子25-29歳 → M25-29), the same rule
 * scripts/fix-age-category-labels.js applies to committed TSVs. A label whose
 * bracket contradicts the row's age stays as it is.
 * @param {string[][]} rows
 * @param {number[]} labelIdxs age_category columns
 * @param {number[]} ageIdxs age columns; the first non-empty one is the age
 */
function canonicalizeAgeCategories(rows, labelIdxs, ageIdxs) {
  for (const r of rows) {
    const age = ageIdxs.map((i) => (r[i] ?? "").trim()).find((v) => v) ?? "";
    for (const i of labelIdxs) {
      const { label } = relabelAgeCategory(r[i] ?? "", age);
      if (label !== null) r[i] = label;
    }
  }
}

/**
 * Rank probe of a TSV: unique valid overall ranks (99999 is the IRONMAN
 * "not ranked" sentinel and is excluded) and rank/total-time ordering
 * violations among the ranked rows.
 * @param {string} tsv
 * @param {string} rankHeader
 * @param {string | undefined} totalHeader
 * @returns {RankProbe}
 */
export function rankProbe(tsv, rankHeader, totalHeader) {
  const lines = tsv.split("\n").filter((l) => l !== "");
  const head = (lines[0] ?? "").split("\t");
  const ri = head.indexOf(rankHeader);
  const ti = totalHeader ? head.indexOf(totalHeader) : -1;
  /** @type {{rank: number, time: number | null}[]} */
  const ranked = [];
  for (const line of lines.slice(1)) {
    const cells = line.split("\t");
    const raw = (cells[ri] ?? "").trim();
    if (!/^\d+$/.test(raw) || Number(raw) === 99999) continue;
    ranked.push({
      rank: Number(raw),
      time: ti >= 0 ? parseTime(cells[ti] ?? "") : null,
    });
  }
  ranked.sort((a, b) => a.rank - b.rank);
  let violations = 0;
  let last = null;
  for (const r of ranked) {
    if (r.time == null) continue;
    if (last != null && r.time < last) violations++;
    last = r.time;
  }
  return { unique: new Set(ranked.map((r) => r.rank)).size, violations };
}

/** @param {string} tsv */
const rowCount = (tsv) => tsv.split("\n").filter((l) => l !== "").length - 1;

/**
 * @param {string[]} headers
 * @param {string[][]} rows
 */
function serializeTsv(headers, rows) {
  const clean = (/** @type {string} */ v) => v.replace(/[\t\r\n]/g, " ");
  return `${[headers, ...rows].map((r) => r.map(clean).join("\t")).join("\n")}\n`;
}

/** @param {string} s */
const normalizedName = (s) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Insert an Edition by date, following the Event's newest-first or
 * oldest-first order (a single-Edition Event counts as newest-first).
 * @param {any[]} editions
 * @param {any} edition
 */
function placeEdition(editions, edition) {
  if (editions.length === 0) return [edition];
  const newestFirst = editions[0].date >= editions[editions.length - 1].date;
  let i = editions.findIndex((e) =>
    newestFirst ? e.date < edition.date : e.date > edition.date,
  );
  if (i < 0) i = editions.length;
  return [...editions.slice(0, i), edition, ...editions.slice(i)];
}

/** @param {string} text */
const sha1 = (text) => createHash("sha1").update(text).digest("hex");

/**
 * @param {any} plan parsed plan JSON (scripts/lib/import-plan-schema.json)
 * @param {{ sources: Sources, repo: import("./repo.js").Repo, dryRun?: boolean }} ports
 * @returns {Promise<ImportReport>}
 */
export async function runImport(plan, { sources, repo, dryRun = false }) {
  const target = dryRun ? memoryRepo({}, repo) : repo;
  /** @type {ImportReport} */
  const report = {
    exit_code: 0,
    dry_run: dryRun,
    plan_errors: [],
    editions: [],
    written: [],
    race_info_needs_format: false,
  };

  const ajv = new Ajv({ strict: false, allErrors: true });
  const validatePlan = ajv.compile(PLAN_SCHEMA);
  if (!validatePlan(plan)) {
    report.plan_errors = (validatePlan.errors ?? []).map(
      (e) => `${e.instancePath || "(plan)"} ${e.message}`,
    );
    report.exit_code = 1;
    return report;
  }

  const raceInfoText = target.readText("race-info.json");
  const schemaText = target.readText("race-info-schema.json");
  if (raceInfoText == null || schemaText == null)
    throw new Error("race-info.json / race-info-schema.json not found in repo");
  const raceInfo = JSON.parse(raceInfoText);
  report.race_info_needs_format =
    `${JSON.stringify(raceInfo, null, 2)}\n` !== raceInfoText;
  ajv.addSchema(JSON.parse(schemaText), "race-info");
  const validateRaceInfo = /** @type {import("ajv").ValidateFunction} */ (
    ajv.getSchema("race-info")
  );
  const validateEvent = /** @type {import("ajv").ValidateFunction} */ (
    ajv.getSchema("race-info#/definitions/RaceEvent")
  );

  /** @type {Map<string, any>} */
  const existingEvents = new Map(raceInfo.events.map((e) => [e.id, e]));

  // ---- Plan-level checks: a failure here means the plan is invalid. ----
  const errors = report.plan_errors;
  /** @type {Map<string, any>} new Event id → Event object (editions filled as they import) */
  const newEvents = new Map();
  for (const ev of plan.events ?? []) {
    if (existingEvents.has(ev.id) || newEvents.has(ev.id)) {
      errors.push(`event ${ev.id}: an Event with this id already exists`);
      continue;
    }
    const norm = normalizedName(ev.name);
    for (const other of [...existingEvents.values(), ...newEvents.values()])
      if (normalizedName(other.name) === norm)
        errors.push(
          `event ${ev.id}: name ${JSON.stringify(ev.name)} duplicates Event ${other.id}`,
        );
    if (target.readText(ev.image) == null)
      errors.push(`event ${ev.id}: image ${ev.image} does not exist`);
    const usedBy = [...existingEvents.values(), ...newEvents.values()].find(
      (o) => o.image === ev.image,
    );
    if (usedBy)
      errors.push(
        `event ${ev.id}: image ${ev.image} is already used by ${usedBy.id}`,
      );
    if (ev.insert_before && !existingEvents.has(ev.insert_before))
      errors.push(
        `event ${ev.id}: insert_before ${ev.insert_before} is not an existing Event`,
      );
    const { insert_before: _, ...fields } = ev;
    newEvents.set(ev.id, {
      id: fields.id,
      name: fields.name,
      ...(fields.location !== undefined && { location: fields.location }),
      location_parts: fields.location_parts,
      ...(fields.description !== undefined && {
        description: fields.description,
      }),
      image: fields.image,
      source: fields.source,
      editions: [],
    });
  }
  const seen = new Set();
  for (const ed of plan.editions) {
    const key = `${ed.event} ${ed.date}`;
    if (seen.has(key))
      errors.push(`edition ${key} appears more than once in the plan`);
    seen.add(key);
  }
  if (errors.length > 0) {
    report.exit_code = 1;
    return report;
  }

  // ---- Shared state across Editions. ----
  /** @type {Set<string>} result_tsv paths registered in race-info (plus this run's) */
  const registered = new Set();
  for (const ev of raceInfo.events)
    for (const ed of ev.editions)
      for (const c of ed.categories) registered.add(c.result_tsv);
  /** @type {Map<string, string>} pending TSV writes, path → text */
  const pending = new Map();
  /** @type {Map<string, string[]> | null} sha1 → TSV paths, built on first use */
  let tsvIndex = null;
  const contaminationSource = (
    /** @type {string} */ text,
    /** @type {string} */ path,
  ) => {
    if (tsvIndex == null) {
      tsvIndex = new Map();
      for (const p of target.list("master/")) {
        if (!p.endsWith(".tsv")) continue;
        const t = target.readText(p);
        if (t == null) continue;
        const h = sha1(t);
        tsvIndex.set(h, [...(tsvIndex.get(h) ?? []), p]);
      }
    }
    const hits = [
      ...(tsvIndex.get(sha1(text)) ?? []),
      ...[...pending].filter(([, t]) => t === text).map(([p]) => p),
    ];
    return hits.find((p) => p !== path) ?? null;
  };

  /**
   * Previous Edition (latest before `date`) and its total row count.
   * @param {any} event
   * @param {string} date
   */
  const previousEdition = (event, date) =>
    event.editions
      .filter((/** @type {any} */ e) => e.date < date)
      .sort((/** @type {any} */ a, /** @type {any} */ b) =>
        b.date.localeCompare(a.date),
      )[0] ?? null;
  /** @param {any} edition */
  const editionRows = (edition) => {
    let total = 0;
    for (const c of edition.categories) {
      const t = target.readText(c.result_tsv);
      if (t == null) return null;
      total += rowCount(t);
    }
    return total;
  };
  /**
   * @param {string[]} warnings
   * @param {number} rows
   * @param {number | null} before
   * @param {string} what
   */
  const countDrop = (warnings, rows, before, what) => {
    if (
      before != null &&
      before > 0 &&
      rows < before * (1 - COUNT_DROP_WARNING)
    )
      warnings.push(
        `Athlete count dropped from ${before} (${what}) to ${rows}, more than ${COUNT_DROP_WARNING * 100}%`,
      );
  };

  /**
   * @param {"ironman" | "jtu" | "prepared"} source
   * @param {any} request
   * @param {string} label
   */
  const fetchTable = async (source, request, label) => {
    const adapter = sources[source];
    if (!adapter)
      throw new Skip(`${label}: no ${source} Results source adapter`);
    let table;
    try {
      table = await adapter.fetch(request);
    } catch (err) {
      throw new Skip(
        `${label}: ${source} fetch failed: ${/** @type {Error} */ (err).message}`,
      );
    }
    if (table.rows.length === 0)
      throw new Skip(`${label}: the source has no rows`);
    for (const [i, row] of table.rows.entries())
      if (row.length !== table.headers.length)
        throw new Skip(
          `${label}: row ${i + 1} has ${row.length} cells for ${table.headers.length} headers`,
        );
    return table;
  };

  /**
   * IRONMAN template from the Event's existing Distance classes.
   * @param {any} event
   */
  const inferTemplate = (event) => {
    const classes = new Set(
      event.editions.flatMap((/** @type {any} */ e) =>
        e.categories.map((/** @type {any} */ c) => c.distance),
      ),
    );
    if (classes.size === 1 && classes.has("LD")) return "full";
    if (classes.size === 1 && classes.has("MD")) return "70.3";
    throw new Skip(
      `${event.id}: cannot infer the IRONMAN template from Distance classes [${[...classes].join(", ")}]; set ironman.template`,
    );
  };

  /**
   * Category from a SourceTable, after every per-Category safety check.
   * @param {any} spec
   * @param {SourceTable} table
   */
  const assembleCategory = (spec, table) => {
    const label = spec.id;
    const { headers } = table;
    const rows = table.rows.map((r) =>
      r.map((v) => (v == null ? "" : String(v))),
    );
    // A Column reads the last of equal headers, so a repeated one would
    // silently drop a column (a duathlon's Ｒ順 for both run legs).
    const repeated = headers.filter((h, i) => headers.indexOf(h) !== i);
    if (repeated.length > 0)
      throw new Skip(
        `${label}: duplicate headers ${[...new Set(repeated)].join(", ")}`,
      );
    const mapped = new Map(table.columns.map((c) => [c.header, c]));
    for (const c of table.columns)
      if (!headers.includes(c.header))
        throw new Skip(`${label}: mapped column ${c.header} is not a header`);
    const unmappedHeaders = headers.filter(
      (h) => !mapped.has(h) && !table.unmapped.includes(h),
    );
    if (unmappedHeaders.length > 0)
      throw new Skip(
        `${label}: headers neither mapped nor listed as unmapped: ${unmappedHeaders.join(", ")}`,
      );

    const col = (/** @type {string} */ h) => headers.indexOf(h);
    const metaIdxs = (/** @type {string} */ role) =>
      table.columns
        .filter((c) => c.role === role && !c.sport)
        .map((c) => col(c.header));
    const nameCol = table.columns.find((c) => c.role === "name" && !c.sport);
    if (nameCol) {
      const i = col(nameCol.header);
      for (const r of rows) r[i] = cleanName(r[i]);
    }
    canonicalizeAgeCategories(rows, metaIdxs("age_category"), metaIdxs("age"));

    const distance = spec.distance ?? table.distance_class;
    if (!distance) throw new Skip(`${label}: no Distance class`);
    const metaCols = table.columns.filter((c) => !c.sport);
    const segCols = table.columns.filter((c) => c.sport);
    /** @type {{sport: string, distance: number | undefined}[]} */
    const declared = (
      spec.segments ??
      table.segments ??
      SPORT_ORDER.filter((s) => segCols.some((c) => c.sport === s)).map(
        (sport) => ({ sport, distance: STANDARD_SEGMENTS[distance]?.[sport] }),
      )
    ).map((/** @type {any} */ s) => ({ sport: s.sport, distance: s.distance }));
    for (const s of declared)
      if (s.distance == null)
        throw new Skip(
          `${label}: no standard ${s.sport} distance for ${distance}; give segments in the plan`,
        );

    /** @type {SourceColumn[][]} */
    const assigned = declared.map(() => []);
    /** @type {SourceColumn[]} */
    const omitted = [];
    const useIndex = !spec.segments && table.segments != null;
    for (const c of segCols) {
      if (c.segment != null && useIndex) {
        assigned[c.segment].push(c);
        continue;
      }
      const at = declared
        .map((s, i) => (s.sport === c.sport ? i : -1))
        .filter((i) => i >= 0);
      if (at.length > 1)
        throw new Skip(
          `${label}: ${c.header} could belong to any of ${at.length} ${c.sport} Segments`,
        );
      if (at.length === 0) omitted.push(c);
      else assigned[at[0]].push(c);
    }
    const roleBased = !segCols.some((c) => c.segment != null);
    declared.forEach((s, i) => {
      if (roleBased && assigned[i].length === 0)
        throw new Skip(
          `${label}: Segment ${s.sport} is declared but the source has no ${s.sport} column`,
        );
    });
    for (const c of omitted) {
      const i = col(c.header);
      const filled = rows.filter((r) => r[i].trim() !== "").length;
      if (filled > 0)
        throw new Skip(
          `${label}: ${c.sport} is omitted from the Segments but ${c.header} has ${filled} non-empty cells`,
        );
    }
    const totalCol = metaCols.find((c) => c.role === "total_time");
    const finishers = totalCol
      ? rows.filter((r) => r[col(totalCol.header)].trim() !== "")
      : rows;
    declared.forEach((s, i) => {
      const laps = assigned[i].filter((c) => c.role === "lap");
      if (laps.length > 1)
        throw new Skip(
          `${label}: Segment ${s.sport} has ${laps.length} lap columns`,
        );
      for (const lap of laps)
        if (!finishers.some((r) => r[col(lap.header)].trim() !== ""))
          throw new Skip(
            `${label}: ${lap.header} (${s.sport} lap) is empty for every finisher; omit the Segment if it was cancelled`,
          );
    });
    for (const role of SINGLE_ROLES) {
      const n = metaCols.filter((c) => c.role === role).length;
      if (n > 1) throw new Skip(`${label}: role ${role} is mapped ${n} times`);
    }
    if (spec.source === "ironman") {
      const division = metaCols.find((c) => c.role === "age_category");
      if (division) {
        const pro = rows.filter((r) =>
          /PRO$/i.test(r[col(division.header)]),
        ).length;
        if (pro >= rows.length * PRO_ONLY_SHARE)
          throw new Skip(
            `${label}: PRO-only results (${pro} of ${rows.length} rows are PRO); the age-group results are not posted yet`,
          );
      }
    }

    const name = spec.name ?? table.name;
    if (!name) throw new Skip(`${label}: no Category name`);
    if (spec.description == null) throw new Skip(`${label}: no description`);
    const category = {
      id: spec.id,
      result_tsv: spec.result_tsv,
      name,
      distance,
      description: spec.description,
      segments: declared.map((s, i) => ({
        sport: s.sport,
        distance: s.distance,
        columns: assigned[i].map((c) => ({ header: c.header, role: c.role })),
      })),
      meta_columns: metaCols.map((c) => ({ header: c.header, role: c.role })),
      source_url: table.source_url ?? null,
      ...(spec.source_ref && { source_ref: spec.source_ref }),
    };
    return { category, tsv: serializeTsv(headers, rows), rows: rows.length };
  };

  /**
   * @param {any} entry
   * @param {any} event
   * @param {string} year
   */
  const categorySpecs = (entry, event, year) => {
    if (entry.ironman) {
      const o =
        typeof entry.ironman === "string"
          ? { id: entry.ironman }
          : entry.ironman;
      const template = o.template ?? inferTemplate(event);
      const dir = `master/${year}/${event.id}_${year}`;
      const where = event.location ? ` ${event.location}.` : "";
      return {
        dir,
        specs: [
          {
            source: "ironman",
            request: { id: o.id, template },
            id: `${event.id}_${year}`,
            result_tsv: `${dir}/default.tsv`,
            description: o.description ?? `${event.name} ${year}.${where}`,
            segments: o.segments,
            source_ref: { results_source: "ironman", id: o.id },
          },
        ],
      };
    }
    const dir = `master/${year}/${event.id}`;
    if (entry.jtu) {
      const prev = previousEdition(event, entry.date);
      return {
        dir,
        specs: entry.jtu.map((/** @type {any} */ p) => {
          let { id, file, name } = p;
          if (id == null || file == null || name == null) {
            const same = (prev?.categories ?? []).filter(
              (/** @type {any} */ c) => c.distance === p.distance,
            );
            if (same.length !== 1)
              throw new Skip(
                `${p.program}: cannot infer id/file/name (${same.length} ${p.distance} Categories in the previous Edition); give them in the plan`,
              );
            id ??= same[0].id;
            file ??= same[0].result_tsv.split("/").pop();
            name ??= same[0].name;
          }
          return {
            source: "jtu",
            request: { program: p.program, columns: p.columns },
            id,
            result_tsv: `${dir}/${file}`,
            name,
            distance: p.distance,
            description: p.description,
            segments: p.segments,
            source_ref: { results_source: "jtu", id: p.program },
          };
        }),
      };
    }
    return {
      dir,
      specs: entry.prepared.map((/** @type {any} */ p) => ({
        source: "prepared",
        request: {
          tsv: p.tsv,
          meta_columns: p.meta_columns,
          segments: p.segments,
          unmapped: p.unmapped,
          source_url: p.source_url,
        },
        id: p.id,
        result_tsv: `${dir}/${p.file}`,
        name: p.name,
        distance: p.distance,
        description: p.description,
      })),
    };
  };

  /**
   * @param {any} entry
   * @param {any} event
   * @param {EditionReport} out
   */
  const addEdition = async (entry, event, out) => {
    const plannedRefs = entry.ironman
      ? [typeof entry.ironman === "string" ? entry.ironman : entry.ironman.id]
      : entry.jtu
        ? entry.jtu.map((/** @type {any} */ p) => p.program)
        : entry.prepared.map((/** @type {any} */ p) => p.id);
    const existing = event.editions.find(
      (/** @type {any} */ e) => e.date === entry.date,
    );
    if (existing) {
      const refs = existing.categories.map((/** @type {any} */ c) =>
        entry.prepared ? c.id : c.source_ref?.id,
      );
      const same =
        refs.length === plannedRefs.length &&
        [...refs].sort().join("\n") === [...plannedRefs].sort().join("\n");
      if (!same)
        throw new Skip(
          `Edition already exists with Source references [${refs.join(", ")}], not the plan's [${plannedRefs.join(", ")}]`,
        );
      out.status = "already-imported";
      out.categories = existing.categories.map((/** @type {any} */ c) => {
        const t = target.readText(c.result_tsv);
        return {
          id: c.id,
          result_tsv: c.result_tsv,
          rows: t == null ? 0 : rowCount(t),
          tsv: "unchanged",
        };
      });
      return;
    }

    const year = entry.date.slice(0, 4);
    const { dir, specs } = categorySpecs(entry, event, year);
    const weatherFile = `${dir}/weather-data.json`;
    for (const p of [dir, weatherFile, ...specs.map((s) => s.result_tsv)])
      if (!/^[\x20-\x7e]+$/.test(p)) throw new Skip(`path ${p} is not ASCII`);

    const assembled = [];
    for (const spec of specs) {
      const table = await fetchTable(spec.source, spec.request, spec.id);
      assembled.push(assembleCategory(spec, table));
    }

    const ids = assembled.map((a) => a.category.id);
    const dupId = ids.find((id, i) => ids.indexOf(id) !== i);
    if (dupId)
      throw new Skip(`Category id ${dupId} is used twice in the Edition`);
    const paths = assembled.map((a) => a.category.result_tsv);
    for (const [i, p] of paths.entries()) {
      if (paths.indexOf(p) !== i)
        throw new Skip(`${p} is used twice in the Edition`);
      if (registered.has(p))
        throw new Skip(`${p} is already registered in race-info.json`);
    }
    for (const a of assembled) {
      const twin = contaminationSource(a.tsv, a.category.result_tsv);
      if (twin)
        throw new Skip(
          `${a.category.id}: TSV is byte-identical to ${twin} (contamination)`,
        );
    }

    const edition = {
      date: entry.date,
      ...(entry.weather !== false && { weather_file: weatherFile }),
      categories: assembled.map((a) => a.category),
    };
    const prev = previousEdition(event, entry.date);
    if (prev)
      countDrop(
        out.warnings,
        assembled.reduce((n, a) => n + a.rows, 0),
        editionRows(prev),
        `previous Edition ${prev.date}`,
      );

    const editions = placeEdition(event.editions, edition);
    if (!validateEvent({ ...event, editions }))
      throw new Skip(
        `race-info schema: ${(validateEvent.errors ?? [])
          .map((e) => `${e.instancePath} ${e.message}`)
          .join("; ")}`,
      );
    event.editions = editions;
    for (const a of assembled) {
      registered.add(a.category.result_tsv);
      pending.set(a.category.result_tsv, a.tsv);
    }
    out.status = "imported";
    out.categories = assembled.map((a) => ({
      id: a.category.id,
      result_tsv: a.category.result_tsv,
      rows: a.rows,
      tsv: "written",
    }));
  };

  /**
   * @param {any} entry
   * @param {any} event
   * @param {EditionReport} out
   */
  const refetchEdition = async (entry, event, out) => {
    const edition = event?.editions.find(
      (/** @type {any} */ e) => e.date === entry.date,
    );
    if (!edition) throw new Skip("Edition does not exist; nothing to refetch");
    /** @type {Map<string, any>} */
    const jtuColumns = new Map(
      (entry.jtu ?? []).map((/** @type {any} */ p) => [p.program, p.columns]),
    );
    /** @type {{path: string, tsv: string}[]} */
    const writes = [];
    for (const c of edition.categories) {
      const ref = c.source_ref;
      if (!ref) throw new Skip(`${c.id}: no source_ref to refetch from`);
      /** @type {any} */
      let request;
      if (ref.results_source === "ironman") {
        const template = { LD: "full", MD: "70.3" }[
          /** @type {string} */ (c.distance)
        ];
        if (!template)
          throw new Skip(
            `${c.id}: no IRONMAN template for Distance class ${c.distance}`,
          );
        request = { id: ref.id, template };
      } else request = { program: ref.id, columns: jtuColumns.get(ref.id) };
      const table = await fetchTable(ref.results_source, request, c.id);

      const metas = c.meta_columns ?? [];
      const header = (/** @type {string} */ role) =>
        metas.find((/** @type {any} */ m) => m.role === role)?.header;
      const rows = table.rows.map((r) =>
        r.map((v) => (v == null ? "" : String(v))),
      );
      const nameHeader = header("name");
      const ni = nameHeader ? table.headers.indexOf(nameHeader) : -1;
      if (ni >= 0) for (const r of rows) r[ni] = cleanName(r[ni]);
      const metaIdxs = (/** @type {string} */ role) =>
        metas
          .filter((/** @type {any} */ m) => m.role === role)
          .map((/** @type {any} */ m) => table.headers.indexOf(m.header))
          .filter((/** @type {number} */ i) => i >= 0);
      canonicalizeAgeCategories(
        rows,
        metaIdxs("age_category"),
        metaIdxs("age"),
      );
      const tsv = serializeTsv(table.headers, rows);
      const committed = target.readText(c.result_tsv);

      const mappedHeaders = [
        ...metas.map((/** @type {any} */ m) => m.header),
        ...c.segments.flatMap((/** @type {any} */ s) =>
          s.columns.map((/** @type {any} */ x) => x.header),
        ),
      ];
      const missing = mappedHeaders.filter((h) => !table.headers.includes(h));
      if (missing.length > 0)
        throw new Skip(
          `${c.id}: refetched headers lack mapped ${missing.join(", ")}`,
        );
      if (committed != null) {
        const before = new Set(committed.split("\n")[0].split("\t"));
        const after = new Set(table.headers);
        if (
          before.size !== after.size ||
          [...after].some((h) => !before.has(h))
        )
          throw new Skip(
            `${c.id}: header set changed from [${[...before].join(", ")}] to [${table.headers.join(", ")}]`,
          );
      }

      /** @type {CategoryReport} */
      const cat = {
        id: c.id,
        result_tsv: c.result_tsv,
        rows: rows.length,
        tsv: "unchanged",
      };
      out.categories.push(cat);
      if (tsv === committed) continue;

      const rankHeader = header("overall_rank");
      if (committed != null && rankHeader) {
        const before = rankProbe(committed, rankHeader, header("total_time"));
        const after = rankProbe(tsv, rankHeader, header("total_time"));
        cat.probe = { before, after };
        if (
          after.unique < before.unique ||
          after.violations > before.violations
        )
          throw new Skip(
            `${c.id}: rank probe degrades (unique ranks ${before.unique} → ${after.unique}, ordering violations ${before.violations} → ${after.violations})`,
          );
      }
      if (committed != null) {
        const old = new Set(committed.split("\n").slice(1));
        cat.changed_rows = tsv
          .split("\n")
          .slice(1)
          .filter((l) => l !== "" && !old.has(l)).length;
        countDrop(
          out.warnings,
          rows.length,
          rowCount(committed),
          "committed TSV",
        );
      }
      if (ref.results_source === "ironman") {
        const division = header("age_category");
        const di = division ? table.headers.indexOf(division) : -1;
        const pro = di < 0 ? 0 : rows.filter((r) => /PRO$/i.test(r[di])).length;
        // A partial upload posts the PRO results first. A Category whose
        // committed TSV is PRO-only too is a PRO Category by design.
        const committedLines = (committed ?? "").split("\n");
        const ci = division
          ? committedLines[0].split("\t").indexOf(division)
          : -1;
        const committedRows = committedLines.slice(1).filter((l) => l !== "");
        const committedPro =
          ci < 0
            ? 0
            : committedRows.filter((l) => /PRO$/i.test(l.split("\t")[ci] ?? ""))
                .length;
        const proByDesign =
          committedRows.length > 0 &&
          committedPro >= committedRows.length * PRO_ONLY_SHARE;
        if (di >= 0 && pro >= rows.length * PRO_ONLY_SHARE && !proByDesign)
          throw new Skip(
            `${c.id}: PRO-only results (${pro} of ${rows.length} rows are PRO)`,
          );
      }
      const twin = contaminationSource(tsv, c.result_tsv);
      if (twin)
        throw new Skip(
          `${c.id}: TSV is byte-identical to ${twin} (contamination)`,
        );
      cat.tsv = "written";
      writes.push({ path: c.result_tsv, tsv });
    }
    for (const w of writes) pending.set(w.path, w.tsv);
    out.status = writes.length > 0 ? "refetched" : "unchanged";
  };

  // ---- Editions, one at a time; a failure skips only that Edition. ----
  for (const entry of plan.editions) {
    const mode = entry.mode ?? "add";
    /** @type {EditionReport} */
    const out = {
      event: entry.event,
      date: entry.date,
      mode,
      status: "skipped",
      warnings: [],
      categories: [],
    };
    report.editions.push(out);
    const event = existingEvents.get(entry.event) ?? newEvents.get(entry.event);
    try {
      if (!event)
        throw new Skip(
          `Event ${entry.event} does not exist and is not in plan.events`,
        );
      if (mode === "refetch") await refetchEdition(entry, event, out);
      else await addEdition(entry, event, out);
    } catch (err) {
      if (!(err instanceof Skip)) throw err;
      out.status = "skipped";
      out.reason = err.message;
      out.categories = [];
    }
  }

  // ---- New Events with at least one imported Edition. ----
  for (const ev of newEvents.values()) {
    if (ev.editions.length === 0) continue;
    const planned = (plan.events ?? []).find(
      (/** @type {any} */ p) => p.id === ev.id,
    );
    const at = planned.insert_before
      ? raceInfo.events.findIndex(
          (/** @type {any} */ e) => e.id === planned.insert_before,
        )
      : -1;
    if (at < 0) raceInfo.events.push(ev);
    else raceInfo.events.splice(at, 0, ev);
  }

  const raceInfoChanged = report.editions.some((e) => e.status === "imported");
  if (raceInfoChanged && !validateRaceInfo(raceInfo)) {
    const why = (validateRaceInfo.errors ?? [])
      .map((e) => `${e.instancePath} ${e.message}`)
      .join("; ");
    for (const e of report.editions)
      if (e.status === "imported" || e.status === "refetched") {
        e.status = "skipped";
        e.reason = `final race-info validation failed: ${why}`;
      }
    pending.clear();
  }

  // ---- Writes: TSVs first, race-info.json once at the end. ----
  for (const [path, text] of pending) {
    target.writeText(path, text);
    report.written.push(path);
  }
  if (report.editions.some((e) => e.status === "imported")) {
    target.writeText(
      "race-info.json",
      `${JSON.stringify(raceInfo, null, 2)}\n`,
    );
    report.written.push("race-info.json");
  }

  report.exit_code = report.editions.some((e) => e.status === "skipped")
    ? 2
    : 0;
  return report;
}
