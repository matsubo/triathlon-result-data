/**
 * Corpus: every Event, Edition and Category under master/ (scripts/lib/
 * layout.js), with the paths the layout derives filled in.
 *
 *   readCorpus(repo, where?) → { events, findings }
 *
 * Each Event is its event.json plus `id` (its directory), `image` (the
 * image.webp path) and `editions` sorted by date. Each Edition is
 * `{ date, weather_file, categories }`: `weather_file` is the
 * weather-data.json path when that file exists, else null. Each Category is
 * its edition.json entry plus `result_tsv`. Events are sorted by id.
 *
 * `where.eventId` keeps one Event; `where.date` keeps the Editions whose date
 * starts with it (a year or a full date). Findings are kept when they lie
 * in the selection; Events without a matching Edition are dropped when
 * `where.date` is given.
 *
 * Only unreadable JSON (an event.json or edition.json that does not parse)
 * throws. Layout defects are Findings:
 *   - unexpected-file: a file under master/ that is none of the corpus files
 *     at its place, or the TSV of no listed Category
 *   - missing-event-json / missing-image: an Event directory without them
 *   - missing-edition-json: an Edition directory without edition.json
 *   - empty-event: an Event without Editions
 *   - duplicate-category: a Category id listed twice in one Edition
 *
 * The corpus is memoized per repo and rebuilt once the repo's generation()
 * moves (a write through the port), so a read after a write never sees the
 * corpus from before it.
 *
 * `eventFile(event)` / `editionFile(eventId, edition)` are the inverse: the
 * file a corpus Event or Edition is stored as, derived fields stripped,
 * serialized as `JSON.stringify(x, null, 2)` plus a newline.
 *
 * @typedef {import("./repo.js").Repo} Repo
 *
 * @typedef {"unexpected-file" | "missing-event-json" | "missing-image" | "missing-edition-json" | "empty-event" | "duplicate-category"} LayoutFindingKind
 * @typedef {object} LayoutFinding
 * @property {LayoutFindingKind} kind
 * @property {string} message
 * @property {string} [eventId]
 * @property {string} [date]
 * @property {string} [categoryId]
 * @property {string} [path]
 *
 * @typedef {Record<string, any> & { id: string, result_tsv: string }} CorpusCategory
 * @typedef {{ date: string, weather_file: string | null, categories: CorpusCategory[] }} CorpusEdition
 * @typedef {Record<string, any> & { id: string, name: string, image: string, editions: CorpusEdition[] }} CorpusEvent
 * @typedef {{ events: CorpusEvent[], findings: LayoutFinding[] }} Corpus
 */
import {
  classify,
  editionJsonPath,
  eventJsonPath,
  imagePath,
  MASTER,
  tsvPath,
  weatherPath,
} from "./layout.js";

/** @type {WeakMap<Repo, { generation: number, corpus: Corpus }>} */
const cache = new WeakMap();

/**
 * @param {Repo} repo
 * @param {{ eventId?: string, date?: string }} [where]
 * @returns {Corpus}
 */
export function readCorpus(repo, where = {}) {
  const generation = repo.generation?.() ?? 0;
  let hit = cache.get(repo);
  if (!hit || hit.generation !== generation) {
    hit = { generation, corpus: loadCorpus(repo) };
    cache.set(repo, hit);
  }
  const { corpus } = hit;
  const { eventId, date } = where;
  if (eventId === undefined && date === undefined) return corpus;
  /** @type {CorpusEvent[]} */
  const events = [];
  for (const event of corpus.events) {
    if (eventId !== undefined && event.id !== eventId) continue;
    if (date === undefined) {
      events.push(event);
      continue;
    }
    const editions = event.editions.filter((e) => e.date.startsWith(date));
    if (editions.length > 0) events.push({ ...event, editions });
  }
  const findings = corpus.findings.filter(
    (f) =>
      f.eventId !== undefined &&
      (eventId === undefined || f.eventId === eventId) &&
      (date === undefined || f.date === undefined || f.date.startsWith(date)),
  );
  return { events, findings };
}

/**
 * @param {Repo} repo
 * @param {string} path
 */
function readJson(repo, path) {
  const text = repo.readText(path);
  if (text === null) throw new Error(`${path} not found`);
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(
      `${path} is not valid JSON: ${/** @type {Error} */ (err).message}`,
    );
  }
}

/**
 * @param {Repo} repo
 * @returns {Corpus}
 */
function loadCorpus(repo) {
  /**
   * @typedef {{ edition: boolean, weather: boolean, tsvs: string[] }} EditionFiles
   * @type {Map<string, { event: boolean, image: boolean, editions: Map<string, EditionFiles> }>}
   */
  const dirs = new Map();
  /** @type {LayoutFinding[]} */
  const findings = [];
  /** @param {import("./layout.js").Classified} c */
  const unexpected = (c, why = "is not a corpus file at its place") =>
    findings.push({
      kind: "unexpected-file",
      message: `${c.path} ${why}`,
      ...(c.eventId !== undefined && { eventId: c.eventId }),
      ...(c.date !== undefined && { date: c.date }),
      path: c.path,
    });

  for (const path of repo.list(MASTER)) {
    const c = classify(path);
    if (!c) continue;
    if (c.kind === "unknown" || c.eventId === undefined) {
      unexpected(c);
      continue;
    }
    let dir = dirs.get(c.eventId);
    if (!dir) {
      dir = { event: false, image: false, editions: new Map() };
      dirs.set(c.eventId, dir);
    }
    if (c.kind === "event") dir.event = true;
    else if (c.kind === "image") dir.image = true;
    else {
      const date = /** @type {string} */ (c.date);
      let ed = dir.editions.get(date);
      if (!ed) {
        ed = { edition: false, weather: false, tsvs: [] };
        dir.editions.set(date, ed);
      }
      if (c.kind === "edition") ed.edition = true;
      else if (c.kind === "weather") ed.weather = true;
      else ed.tsvs.push(/** @type {string} */ (c.categoryId));
    }
  }

  /** @type {CorpusEvent[]} */
  const events = [];
  for (const id of [...dirs.keys()].sort()) {
    const dir = /** @type {NonNullable<ReturnType<typeof dirs.get>>} */ (
      dirs.get(id)
    );
    if (!dir.image)
      findings.push({
        kind: "missing-image",
        message: `Event ${id} has no ${imagePath(id)}`,
        eventId: id,
        path: imagePath(id),
      });
    if (!dir.event) {
      findings.push({
        kind: "missing-event-json",
        message: `Event directory of ${id} has no ${eventJsonPath(id)}`,
        eventId: id,
        path: eventJsonPath(id),
      });
      continue;
    }
    /** @type {CorpusEdition[]} */
    const editions = [];
    for (const date of [...dir.editions.keys()].sort()) {
      const files = /** @type {EditionFiles} */ (dir.editions.get(date));
      if (!files.edition) {
        findings.push({
          kind: "missing-edition-json",
          message: `Edition directory ${id} ${date} has no ${editionJsonPath(id, date)}`,
          eventId: id,
          date,
          path: editionJsonPath(id, date),
        });
        for (const categoryId of files.tsvs)
          unexpected({
            kind: "tsv",
            path: tsvPath(id, date, categoryId),
            eventId: id,
            date,
          });
        if (files.weather)
          unexpected({
            kind: "weather",
            path: weatherPath(id, date),
            eventId: id,
            date,
          });
        continue;
      }
      const raw = readJson(repo, editionJsonPath(id, date));
      const seen = new Set();
      /** @type {CorpusCategory[]} */
      const categories = [];
      for (const def of Array.isArray(raw?.categories) ? raw.categories : []) {
        if (seen.has(def.id))
          findings.push({
            kind: "duplicate-category",
            message: `Category ${def.id} is listed more than once in ${editionJsonPath(id, date)}`,
            eventId: id,
            date,
            categoryId: def.id,
          });
        seen.add(def.id);
        categories.push({
          id: def.id,
          result_tsv: tsvPath(id, date, def.id),
          ...def,
        });
      }
      for (const categoryId of files.tsvs) {
        if (seen.has(categoryId)) continue;
        const path = tsvPath(id, date, categoryId);
        unexpected(
          { kind: "tsv", path, eventId: id, date },
          `is the TSV of no Category in ${editionJsonPath(id, date)}`,
        );
      }
      editions.push({
        date,
        weather_file: files.weather ? weatherPath(id, date) : null,
        categories,
      });
    }
    if (editions.length === 0)
      findings.push({
        kind: "empty-event",
        message: `Event ${id} has no Edition`,
        eventId: id,
      });
    events.push({
      id,
      ...readJson(repo, eventJsonPath(id)),
      image: imagePath(id),
      editions,
    });
  }
  return { events, findings };
}

/** @param {unknown} value */
export const serializeJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * The event.json of a corpus Event.
 * @param {Record<string, any>} event
 * @returns {{ path: string, text: string }}
 */
export function eventFile(event) {
  const { id, image: _image, editions: _editions, ...fields } = event;
  return { path: eventJsonPath(id), text: serializeJson(fields) };
}

/**
 * The edition.json of a corpus Edition.
 * @param {string} eventId
 * @param {{ date: string, categories: Record<string, any>[] }} edition
 * @returns {{ path: string, text: string }}
 */
export function editionFile(eventId, edition) {
  const categories = edition.categories.map((c) => {
    const { result_tsv: _tsv, ...fields } = c;
    return fields;
  });
  return {
    path: editionJsonPath(eventId, edition.date),
    text: serializeJson({ categories }),
  };
}
