/**
 * Edition document: the normalized JSON of one Edition (result-schema.json),
 * built from the Category reader.
 *
 *   editionDocument(repo, eventId, dateOrYear) → { document, warnings, issues }
 *
 * `dateOrYear` is a full date or any prefix of one, such as a year. It must
 * match exactly one Edition of the Event.
 *
 * Warnings are the Category findings that lose data (unmapped-header,
 * missing-tsv) and the unknown status tokens the Status module reports, in
 * output order. `issues` carries the same warnings with their Category and
 * kind.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { buildAthlete, checkRoles } from "./build-athlete.js";
import { readCategories } from "./category-reader.js";

/**
 * @typedef {import("./repo.js").Repo} Repo
 * @typedef {import("./build-athlete.js").Athlete} Athlete
 * @typedef {"unmapped-header" | "missing-tsv" | "unknown-status-token"} IssueKind
 * @typedef {{ categoryId: string | null, kind: IssueKind | "missing-weather", message: string }} Issue
 *
 * @typedef {object} DocumentCategory
 * @property {string} id
 * @property {string} name
 * @property {string} distance
 * @property {string} description
 * @property {{ sport: string, distance_km: number }[]} segments
 * @property {Athlete[]} athletes
 *
 * @typedef {object} EditionDocument the normalized JSON of one Edition (result-schema.json)
 * @property {string} event_id
 * @property {string} name
 * @property {string} location
 * @property {string} date
 * @property {unknown} weather the parsed weather-data.json, or null
 * @property {DocumentCategory[]} categories
 */

/** No Edition of the Event matches (or the Event does not exist). */
export class EditionNotFound extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "EditionNotFound";
  }
}

/** The date prefix (a year) matches more than one Edition. */
export class AmbiguousEdition extends Error {
  /**
   * @param {string} eventId
   * @param {string} dateOrYear
   * @param {string[]} dates
   */
  constructor(eventId, dateOrYear, dates) {
    super(
      `"${dateOrYear}" matches ${dates.length} editions of event "${eventId}": ${dates.join(", ")}; pass the full date`,
    );
    this.name = "AmbiguousEdition";
    this.dates = dates;
  }
}

/** The document fails result-schema.json. */
export class SchemaInvalid extends Error {
  /**
   * @param {import("ajv").ErrorObject[]} errors
   * @param {string[]} warnings the warnings raised before validation
   */
  constructor(errors, warnings) {
    super(
      `Schema validation errors:\n${errors.map((e) => `  ${e.instancePath}: ${e.message}`).join("\n")}`,
    );
    this.name = "SchemaInvalid";
    this.errors = errors;
    this.warnings = warnings;
  }
}

/** @type {import("ajv").ValidateFunction | undefined} */
let validateDocument;

function validator() {
  if (!validateDocument) {
    const schema = JSON.parse(
      readFileSync(
        join(import.meta.dirname, "..", "..", "result-schema.json"),
        "utf-8",
      ),
    );
    const ajv = new Ajv({ strict: false });
    addFormats(ajv);
    validateDocument = ajv.compile(schema);
  }
  return validateDocument;
}

const WARNED_FINDINGS = new Set(["unmapped-header", "missing-tsv"]);

/**
 * @param {Repo} repo
 * @param {string} eventId
 * @param {string} dateOrYear
 * @returns {{ document: EditionDocument, warnings: string[], issues: Issue[] }}
 */
export function editionDocument(repo, eventId, dateOrYear) {
  const { editions } = readCategories(repo, { eventId, date: dateOrYear });
  if (editions.length === 0) {
    const known = readCategories(repo, { eventId }).editions.length > 0;
    throw new EditionNotFound(
      known
        ? `no edition found for event "${eventId}" in year ${dateOrYear}`
        : `event "${eventId}" not found in race-info.json`,
    );
  }
  if (editions.length > 1) {
    throw new AmbiguousEdition(
      eventId,
      dateOrYear,
      editions.map((e) => e.edition.date),
    );
  }
  const [{ event, edition, categories }] = editions;

  /** @type {Issue[]} */
  const issues = [];

  let weather = null;
  if (edition.weather_file) {
    const text = repo.readText(edition.weather_file);
    if (text === null) {
      issues.push({
        categoryId: null,
        kind: "missing-weather",
        message: `weather file not found: ${edition.weather_file}`,
      });
    } else {
      weather = JSON.parse(text);
    }
  }

  const documentCategories = categories.map((category) => {
    const { def } = category;
    const columns = category.columns();
    checkRoles(columns, category.key);
    for (const f of category.findings) {
      if (WARNED_FINDINGS.has(f.kind)) {
        issues.push({
          categoryId: def.id,
          kind: /** @type {IssueKind} */ (f.kind),
          message: f.message,
        });
      }
    }

    // Rows without a name (continuation lines of a wrapped note) are not
    // Athletes, so their rank cell text raises no warning.
    /** @type {Athlete[]} */
    const athletes = [];
    for (const row of category.rows) {
      /** @type {string | null} */
      let unknownToken = null;
      const athlete = buildAthlete(
        row,
        columns,
        def.segments.length,
        (token) => {
          unknownToken = token;
        },
      );
      if (athlete.name === "") continue;
      athletes.push(athlete);
      if (unknownToken !== null) {
        issues.push({
          categoryId: def.id,
          kind: "unknown-status-token",
          message: `Unknown status token "${unknownToken}" in ${def.result_tsv}`,
        });
      }
    }

    return {
      id: def.id,
      name: def.name,
      distance: def.distance,
      description: def.description,
      segments: def.segments.map((/** @type {any} */ seg) => ({
        sport: seg.sport,
        distance_km: seg.distance,
      })),
      athletes,
    };
  });

  const document = {
    event_id: event.id,
    name: event.name,
    location: event.location,
    date: edition.date,
    weather,
    categories: documentCategories,
  };

  const warnings = issues.map((i) => i.message);
  const validate = validator();
  if (!validate(document)) {
    throw new SchemaInvalid(validate.errors ?? [], warnings);
  }

  return { document, warnings, issues };
}
