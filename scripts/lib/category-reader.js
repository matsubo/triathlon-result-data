/**
 * Category reader: every Category of the corpus (scripts/lib/corpus.js) with
 * its result TSV read by Column role. Callers ask for cells by role instead
 * of guessing headers.
 *
 *   readCategories(repo, where?) → { categories, editions, findings, cells(role) }
 *   parseCategory(def, text) → Category    one Category from its definition and TSV text, no repo
 *
 * `where.eventId` keeps one Event; `where.date` keeps the Editions whose date
 * starts with it, so a year and a full date both work.
 *
 * A reader is a snapshot of one corpus, memoized with it: master/ is listed
 * once, and each TSV is parsed at most once, when first asked for. A write
 * through the repo port makes the next readCategories read a fresh corpus.
 *
 * Parsing matches what normalization has always done: lines split on `\n`,
 * lines whose trim() is empty dropped, the first remaining line is the
 * header row, headers and cells trimmed. A Column reads the LAST header that
 * equals its declared header, so a duplicated header resolves to its last
 * occurrence.
 *
 * Only an unreadable event.json or edition.json throws. Data defects are
 * Findings: corpus-scope ones (the layout Findings of scripts/lib/corpus.js)
 * on the result, Category-scope ones on the Category.
 *
 * @typedef {import("./repo.js").Repo} Repo
 * @typedef {import("./corpus.js").CorpusEvent} CorpusEvent
 * @typedef {import("./corpus.js").CorpusEdition} CorpusEdition
 *
 * @typedef {import("./corpus.js").LayoutFindingKind | "missing-tsv" | "unmapped-header" | "duplicate-header"} FindingKind
 * @typedef {object} Finding
 * @property {FindingKind} kind
 * @property {string} message
 * @property {string} [eventId]
 * @property {string} [date]
 * @property {string} [categoryId]
 * @property {string} [tsv] Category-scope Findings: the result TSV
 * @property {string} [path] layout Findings: the file concerned
 *
 * @typedef {object} Column
 * @property {string} role Column role
 * @property {string} header declared header
 * @property {number} index index of the last TSV header equal to `header`; -1 when absent
 * @property {number | null} segment index into `def.segments`, null for a meta column
 *
 * @typedef {object} Row
 * @property {number} line 1-based physical line number in the TSV
 * @property {string[]} raw cells as written, untrimmed, without the line's trailing \r
 * @property {string[]} cells trimmed cells
 * @property {(role: string) => string} get first non-empty value of the role's columns in declaration order, or ""
 * @property {(role: string) => string[]} all every value of the role's columns in declaration order ("" when absent)
 * @property {(column: Column) => string} at the column's value; "" when the column or the cell is absent
 *
 * @typedef {object} Cell
 * @property {string} value trimmed value
 * @property {string} raw value as written
 * @property {Row} row
 * @property {Column} column
 * @property {Category} category
 * @property {string} where `${tsv}:${line} ${header}=${value}`
 *
 * @typedef {object} Category
 * @property {string} key `${eventId}/${date}/${categoryId}`
 * @property {string} eventId
 * @property {string} date
 * @property {CorpusEvent | null} event corpus Event (null from parseCategory)
 * @property {CorpusEdition | null} edition corpus Edition (null from parseCategory)
 * @property {any} def the Category's edition.json entry, plus result_tsv
 * @property {string} tsv result TSV path
 * @property {string | null} text TSV text, null when the file is missing
 * @property {string[]} headers trimmed header row
 * @property {(role?: string, options?: { segment?: number | null }) => Column[]} columns declaration order: meta_columns, then each Segment's columns
 * @property {Row[]} rows data rows
 * @property {(role: string | string[]) => Cell[]} cells cells of the role(s) in present columns, row by row in declaration order
 * @property {Finding[]} findings missing-tsv, unmapped-header, duplicate-header
 *
 * @typedef {object} EditionEntry
 * @property {string} key `${eventId}/${date}`
 * @property {CorpusEvent} event
 * @property {CorpusEdition} edition
 * @property {Category[]} categories
 *
 * @typedef {object} Selection
 * @property {Category[]} categories
 * @property {EditionEntry[]} editions
 * @property {Finding[]} findings layout Findings (scripts/lib/corpus.js) in the selection
 * @property {(role: string | string[]) => Cell[]} cells
 */
import { readCorpus } from "./corpus.js";

/** @type {WeakMap<import("./corpus.js").Corpus, EditionEntry[]>} */
const readers = new WeakMap();

/**
 * @param {Repo} repo
 * @param {{ eventId?: string, date?: string }} [where]
 * @returns {Selection}
 */
export function readCategories(repo, where = {}) {
  const corpus = readCorpus(repo);
  let all = readers.get(corpus);
  if (!all) {
    all = corpus.events.flatMap((event) =>
      event.editions.map((edition) => ({
        key: `${event.id}/${edition.date}`,
        event,
        edition,
        categories: edition.categories.map((def) =>
          makeCategory(
            {
              key: `${event.id}/${edition.date}/${def.id}`,
              eventId: event.id,
              date: edition.date,
              event,
              edition,
            },
            def,
            def.result_tsv,
            () => repo.readText(def.result_tsv),
          ),
        ),
      })),
    );
    readers.set(corpus, all);
  }
  const { eventId, date } = where;
  const editions = all.filter(
    (e) =>
      (eventId === undefined || e.event.id === eventId) &&
      (date === undefined || e.edition.date.startsWith(date)),
  );
  const categories = editions.flatMap((e) => e.categories);
  return {
    categories,
    editions,
    findings: readCorpus(repo, where).findings,
    cells: (role) => categories.flatMap((c) => c.cells(role)),
  };
}

/**
 * One Category read from its definition and TSV text, outside any repo:
 * `key` is the Category id, `eventId` and `date` are empty, `tsv` is
 * `def.result_tsv` (or `<id>.tsv`).
 * @param {any} def a Category of edition.json (result_tsv optional)
 * @param {string | null} text TSV text; null reads as a missing TSV
 * @returns {Category}
 */
export function parseCategory(def, text) {
  return makeCategory(
    { key: def.id, eventId: "", date: "", event: null, edition: null },
    def,
    def.result_tsv ?? `${def.id}.tsv`,
    () => text,
  );
}

/**
 * @param {Pick<Category, "key" | "eventId" | "date" | "event" | "edition">} scope
 * @param {any} def
 * @param {string} tsv
 * @param {() => string | null} readText
 * @returns {Category}
 */
function makeCategory(scope, def, tsv, readText) {
  /** @type {{ text: string | null, headers: string[], rows: Row[], columns: Column[], findings: Finding[] } | undefined} */
  let parsed;
  const parse = () => {
    if (parsed) return parsed;
    const text = readText();
    const { headers, columns, rows } = splitTsv(text ?? "", (headers) => [
      ...(def.meta_columns ?? []).map((/** @type {any} */ m) =>
        column(m, null, headers),
      ),
      ...(def.segments ?? []).flatMap((/** @type {any} */ s, i) =>
        (s.columns ?? []).map((/** @type {any} */ c) => column(c, i, headers)),
      ),
    ]);
    parsed = {
      text,
      headers,
      rows,
      columns,
      findings: categoryFindings(category, text, headers, columns),
    };
    return parsed;
  };

  /** @type {Category} */
  const category = {
    ...scope,
    def,
    tsv,
    get text() {
      return parse().text;
    },
    get headers() {
      return parse().headers;
    },
    get rows() {
      return parse().rows;
    },
    get findings() {
      return parse().findings;
    },
    columns(role, options = {}) {
      return parse().columns.filter(
        (c) =>
          (role === undefined || c.role === role) &&
          (options.segment === undefined || c.segment === options.segment),
      );
    },
    cells(role) {
      const roles = new Set(Array.isArray(role) ? role : [role]);
      const cols = parse().columns.filter(
        (c) => roles.has(c.role) && c.index >= 0,
      );
      /** @type {Cell[]} */
      const out = [];
      for (const row of parse().rows) {
        for (const col of cols) out.push(new TsvCell(row, col, category));
      }
      return out;
    },
  };
  return category;
}

/**
 * @param {{ header: string, role: string }} decl
 * @param {number | null} segment
 * @param {string[]} headers
 * @returns {Column}
 */
function column(decl, segment, headers) {
  return {
    role: decl.role,
    header: decl.header,
    index: headers.lastIndexOf(decl.header),
    segment,
  };
}

/**
 * @param {string} text
 * @param {(headers: string[]) => Column[]} columnsOf
 * @returns {{ headers: string[], columns: Column[], rows: Row[] }}
 */
function splitTsv(text, columnsOf) {
  const physical = text.split("\n");
  let i = physical.findIndex((line) => line.trim() !== "");
  const headers =
    i < 0
      ? []
      : stripCr(physical[i])
          .split("\t")
          .map((h) => h.trim());
  const columns = columnsOf(headers);
  /** @type {Row[]} */
  const rows = [];
  if (i < 0) return { headers, columns, rows };
  for (i++; i < physical.length; i++) {
    const line = physical[i];
    if (line.trim() === "") continue;
    rows.push(new TsvRow(i + 1, line, columns));
  }
  return { headers, columns, rows };
}

/** @param {string} line */
function stripCr(line) {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

/**
 * A data row. The rows of the whole corpus stay in memory for the life of
 * the reader, so a row keeps only its line (a slice sharing the TSV text) and,
 * once a cell is read, the offsets of its tabs; `raw` and `cells` are split
 * on each access.
 * @implements {Row}
 */
class TsvRow {
  /** @type {Int32Array | null} end offset of each cell */
  #ends = null;

  /**
   * @param {number} line
   * @param {string} text the physical line, \r included
   * @param {Column[]} columns
   */
  constructor(line, text, columns) {
    this.line = line;
    /** @private */
    this.text = text;
    /** @private */
    this.columns = columns;
  }

  get raw() {
    return stripCr(this.text).split("\t");
  }

  get cells() {
    return this.raw.map((c) => c.trim());
  }

  /**
   * Untrimmed cell at a header index, undefined past the row's end.
   * @param {number} index
   */
  rawCell(index) {
    let ends = this.#ends;
    if (ends === null) {
      const { text } = this;
      const end = text.endsWith("\r") ? text.length - 1 : text.length;
      let tabs = 0;
      for (
        let p = text.indexOf("\t");
        p >= 0 && p < end;
        p = text.indexOf("\t", p + 1)
      )
        tabs++;
      ends = new Int32Array(tabs + 1);
      let k = 0;
      for (
        let p = text.indexOf("\t");
        p >= 0 && p < end;
        p = text.indexOf("\t", p + 1)
      )
        ends[k++] = p;
      ends[k] = end;
      this.#ends = ends;
    }
    if (index >= ends.length) return undefined;
    return this.text.slice(index === 0 ? 0 : ends[index - 1] + 1, ends[index]);
  }

  /** @param {Column} col */
  at(col) {
    return col.index < 0 ? "" : (this.rawCell(col.index)?.trim() ?? "");
  }

  /** @param {string} role */
  get(role) {
    for (const col of this.columns) {
      if (col.role !== role) continue;
      const v = this.at(col);
      if (v !== "") return v;
    }
    return "";
  }

  /** @param {string} role */
  all(role) {
    return this.columns.filter((c) => c.role === role).map((c) => this.at(c));
  }
}

/** @implements {Cell} */
class TsvCell {
  /**
   * @param {TsvRow} row
   * @param {Column} column
   * @param {Category} category
   */
  constructor(row, column, category) {
    this.row = row;
    this.column = column;
    this.category = category;
    this.value = row.at(column);
  }

  get raw() {
    return this.row.rawCell(this.column.index) ?? "";
  }

  get where() {
    return `${this.category.tsv}:${this.row.line} ${this.column.header}=${this.value}`;
  }
}

/**
 * @param {Category} category
 * @param {string | null} text
 * @param {string[]} headers
 * @param {Column[]} columns
 * @returns {Finding[]}
 */
function categoryFindings(category, text, headers, columns) {
  const scope = {
    eventId: category.eventId,
    date: category.date,
    categoryId: category.def.id,
    tsv: category.tsv,
  };
  if (text === null) {
    return [
      {
        kind: "missing-tsv",
        message: `Result TSV not found: ${category.tsv}`,
        ...scope,
      },
    ];
  }
  /** @type {Finding[]} */
  const out = [];
  for (const col of columns) {
    if (col.index >= 0) continue;
    out.push({
      kind: "unmapped-header",
      message: `Header mismatch in ${category.tsv}: column "${col.header}" not found in TSV headers`,
      ...scope,
    });
  }
  const reported = new Set();
  for (const col of columns) {
    if (col.index < 0 || reported.has(col.header)) continue;
    if (headers.indexOf(col.header) === col.index) continue;
    reported.add(col.header);
    out.push({
      kind: "duplicate-header",
      message: `Duplicate header in ${category.tsv}: column "${col.header}" appears more than once; the last one is read`,
      ...scope,
    });
  }
  return out;
}

/**
 * Rewrite the cells of a role in a Category's TSV text. `fn` gets each
 * present cell's trimmed value and returns its replacement, or undefined to
 * keep it. Every other byte (line endings, \r, tabs, untouched cells) stays.
 * @param {Category} category
 * @param {string | string[]} role
 * @param {(value: string, row: Row, column: Column) => string | undefined} fn
 * @returns {string | null} the new text, or null when nothing changes
 */
export function rewriteCells(category, role, fn) {
  const text = category.text;
  if (text === null) return null;
  const roles = new Set(Array.isArray(role) ? role : [role]);
  const cols = category
    .columns()
    .filter((c) => roles.has(c.role) && c.index >= 0);
  if (cols.length === 0) return null;
  const lines = text.split("\n");
  let changed = false;
  for (const row of category.rows) {
    const parts = [...row.raw];
    let rowChanged = false;
    for (const col of cols) {
      const next = fn(row.at(col), row, col);
      if (next === undefined || next === (parts[col.index] ?? "")) continue;
      while (parts.length <= col.index) parts.push("");
      parts[col.index] = next;
      rowChanged = true;
    }
    if (!rowChanged) continue;
    const original = lines[row.line - 1];
    lines[row.line - 1] =
      parts.join("\t") + (original.endsWith("\r") ? "\r" : "");
    changed = true;
  }
  return changed ? lines.join("\n") : null;
}
