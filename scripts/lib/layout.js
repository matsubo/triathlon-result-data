/**
 * Layout: the one place that knows where corpus files live under master/.
 * Every path is derived from (Event id, Edition date, Category id); nothing
 * stores a path.
 *
 *   master/<event_id>/event.json                    Event fields
 *   master/<event_id>/image.webp                    Event image
 *   master/<event_id>/<YYYY-MM-DD>/edition.json     { categories: [...] }
 *   master/<event_id>/<YYYY-MM-DD>/<category_id>.tsv  result TSV of a Category
 *   master/<event_id>/<YYYY-MM-DD>/weather-data.json  present iff the Edition has weather
 *
 * `classify(path)` is the inverse: it names the kind of a repo path, so a
 * caller holding only a file list (a git tree) can group files by Event and
 * Edition without knowing the layout.
 *
 * @typedef {"event" | "image" | "edition" | "tsv" | "weather"} FileKind
 * @typedef {object} Classified
 * @property {FileKind | "unknown"} kind "unknown": under master/ but not a corpus file at a valid place
 * @property {string} path
 * @property {string} [eventId] the Event directory the path lies in, when it names one
 * @property {string} [date] the Edition directory the path lies in, when it names one
 * @property {string} [categoryId] kind "tsv" only
 */

export const MASTER = "master";
export const EVENT_ID = /^[a-z0-9_]+$/;
export const CATEGORY_ID = /^[a-z0-9_]+$/;
export const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/** @param {string} eventId */
export const eventDir = (eventId) => `${MASTER}/${eventId}`;
/** @param {string} eventId */
export const eventJsonPath = (eventId) => `${eventDir(eventId)}/event.json`;
/** @param {string} eventId */
export const imagePath = (eventId) => `${eventDir(eventId)}/image.webp`;
/**
 * @param {string} eventId
 * @param {string} date
 */
export const editionDir = (eventId, date) => `${eventDir(eventId)}/${date}`;
/**
 * @param {string} eventId
 * @param {string} date
 */
export const editionJsonPath = (eventId, date) =>
  `${editionDir(eventId, date)}/edition.json`;
/**
 * @param {string} eventId
 * @param {string} date
 * @param {string} categoryId
 */
export const tsvPath = (eventId, date, categoryId) =>
  `${editionDir(eventId, date)}/${categoryId}.tsv`;
/**
 * @param {string} eventId
 * @param {string} date
 */
export const weatherPath = (eventId, date) =>
  `${editionDir(eventId, date)}/weather-data.json`;

/**
 * @param {string} path repo-relative `/` path
 * @returns {Classified | null} null when the path is outside master/
 */
export function classify(path) {
  const parts = path.split("/");
  if (parts[0] !== MASTER || parts.length < 2) return null;
  /** @type {Classified} */
  const out = { kind: "unknown", path };
  const [, eventId, second, third] = parts;
  if (!EVENT_ID.test(eventId) || parts.length === 2) return out;
  out.eventId = eventId;
  if (parts.length === 3) {
    if (second === "event.json") out.kind = "event";
    else if (second === "image.webp") out.kind = "image";
    return out;
  }
  if (!DATE.test(second)) return out;
  out.date = second;
  if (parts.length !== 4) return out;
  if (third === "edition.json") out.kind = "edition";
  else if (third === "weather-data.json") out.kind = "weather";
  else if (third.endsWith(".tsv") && CATEGORY_ID.test(third.slice(0, -4))) {
    out.kind = "tsv";
    out.categoryId = third.slice(0, -4);
  }
  return out;
}
