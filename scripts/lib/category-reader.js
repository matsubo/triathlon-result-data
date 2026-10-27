/**
 * Category reader: every Category of race-info.json with its result TSV read
 * by Column role. Callers ask for cells by role instead of guessing headers.
 *
 *   readCategories(repo, where?) → { categories, editions, findings, cells(role) }
 *
 * `where.eventId` keeps one Event; `where.date` keeps the Editions whose date
 * starts with it, so a year and a full date both work.
 *
 * A reader is a snapshot of one repo object (scripts/lib/repo.js), memoized
 * per repo: race-info.json is parsed once, master/ is listed once, and each
 * TSV is parsed at most once, when first asked for. After writing to a repo,
 * read through a new repo object.
 *
 * Parsing matches what normalization has always done: lines split on `\n`,
 * lines whose trim() is empty dropped, the first remaining line is the
 * header row, headers and cells trimmed. A Column reads the LAST header that
 * equals its declared header, so a duplicated header resolves to its last
 * occurrence.
 *
 * Only a missing or invalid race-info.json throws. Data defects are Findings:
 * corpus-scope ones on the result, Category-scope ones on the Category.
 *
 * @typedef {import("./repo.js").Repo} Repo
 *
 * @typedef {"duplicate-edition" | "shared-tsv" | "unregistered-tsv" | "missing-tsv" | "unmapped-header" | "duplicate-header"} FindingKind
 * @typedef {object} Finding
 * @property {FindingKind} kind
 * @property {string} message
 * @property {string} [eventId]
 * @property {string} [date]
 * @property {string} [categoryId]
 * @property {string} [tsv]
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
 * @property {any} event raw race-info Event
 * @property {any} edition raw race-info Edition
 * @property {any} def raw race-info Category
 * @property {string} tsv result_tsv path
 * @property {string | null} text TSV text, null when the file is missing
 * @property {string[]} headers trimmed header row
 * @property {(role?: string, options?: { segment?: number | null }) => Column[]} columns declaration order: meta_columns, then each Segment's columns
 * @property {Row[]} rows data rows
 * @property {(role: string | string[]) => Cell[]} cells cells of the role(s) in present columns, row by row in declaration order
 * @property {Finding[]} findings missing-tsv, unmapped-header, duplicate-header
 *
 * @typedef {object} EditionEntry
 * @property {string} key `${eventId}/${date}`
 * @property {any} event
 * @property {any} edition
 * @property {Category[]} categories
 *
 * @typedef {object} Selection
 * @property {Category[]} categories
 * @property {EditionEntry[]} editions
 * @property {Finding[]} findings corpus-scope Findings touching the selection
 * @property {(role: string | string[]) => Cell[]} cells
 */

/** @type {WeakMap<Repo, ReturnType<typeof loadCorpus>>} */
const corpora = new WeakMap();

/**
 * @param {Repo} repo
 * @param {{ eventId?: string, date?: string }} [where]
 * @returns {Selection}
 */
export function readCategories(repo, where = {}) {
  let corpus = corpora.get(repo);
  if (!corpus) {
    corpus = loadCorpus(repo);
    corpora.set(repo, corpus);
  }
  const { eventId, date } = where;
  const editions = corpus.editions.filter(
    (e) =>
      (eventId === undefined || e.event.id === eventId) &&
      (date === undefined || e.edition.date.startsWith(date)),
  );
  const categories = editions.flatMap((e) => e.categories);
  const unfiltered = eventId === undefined && date === undefined;
  const keys = new Set(categories.map((c) => c.key));
  const editionKeys = new Set(editions.map((e) => e.key));
  const findings = corpus.findings.filter((f) => {
    if (f.kind === "unregistered-tsv") return unfiltered;
    if (unfiltered) return true;
    if (f.kind === "duplicate-edition")
      return editionKeys.has(`${f.eventId}/${f.date}`);
    return corpus.sharers
      .get(/** @type {string} */ (f.tsv))
      ?.some((c) => keys.has(c.key));
  });
  return {
    categories,
    editions,
    findings,
    cells: (role) => categories.flatMap((c) => c.cells(role)),
  };
}

/** @param {Repo} repo */
function loadCorpus(repo) {
  const text = repo.readText("race-info.json");
  if (text === null) throw new Error("race-info.json not found");
  let raceInfo;
  try {
    raceInfo = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `race-info.json is not valid JSON: ${/** @type {Error} */ (err).message}`,
    );
  }
  if (!raceInfo || !Array.isArray(raceInfo.events)) {
    throw new Error('race-info.json: expected { "events": [] }');
  }

  /** @type {EditionEntry[]} */
  const editions = [];
  /** @type {Map<string, Category[]>} */
  const sharers = new Map();
  /** @type {Finding[]} */
  const findings = [];
  /** @type {Set<string>} */
  const editionKeys = new Set();

  for (const event of raceInfo.events) {
    for (const edition of event.editions ?? []) {
      const key = `${event.id}/${edition.date}`;
      if (editionKeys.has(key)) {
        findings.push({
          kind: "duplicate-edition",
          message: `Edition ${event.id} ${edition.date} is registered more than once`,
          eventId: event.id,
          date: edition.date,
        });
      }
      editionKeys.add(key);
      const categories = (edition.categories ?? []).map(
        (/** @type {any} */ def) => makeCategory(repo, event, edition, def),
      );
      for (const c of categories) {
        const list = sharers.get(c.tsv);
        if (list) list.push(c);
        else sharers.set(c.tsv, [c]);
      }
      editions.push({ key, event, edition, categories });
    }
  }

  for (const [tsv, list] of sharers) {
    if (list.length < 2) continue;
    findings.push({
      kind: "shared-tsv",
      message: `${tsv} is the result TSV of ${list.length} Categories: ${list.map((c) => c.key).join(", ")}`,
      tsv,
    });
  }
  for (const path of repo.list("master")) {
    if (!path.endsWith(".tsv") || sharers.has(path)) continue;
    findings.push({
      kind: "unregistered-tsv",
      message: `${path} is no Category's result TSV`,
      tsv: path,
    });
  }

  return { editions, findings, sharers };
}

/**
 * @param {Repo} repo
 * @param {any} event
 * @param {any} edition
 * @param {any} def
 * @returns {Category}
 */
function makeCategory(repo, event, edition, def) {
  const tsv = def.result_tsv;
  /** @type {{ text: string | null, headers: string[], rows: Row[], columns: Column[], findings: Finding[] } | undefined} */
  let parsed;
  const parse = () => {
    if (parsed) return parsed;
    const text = repo.readText(tsv);
    const { headers, lines } = splitTsv(text ?? "");
    /** @type {Column[]} */
    const columns = [
      ...(def.meta_columns ?? []).map((/** @type {any} */ m) =>
        column(m, null, headers),
      ),
      ...(def.segments ?? []).flatMap((/** @type {any} */ s, i) =>
        (s.columns ?? []).map((/** @type {any} */ c) => column(c, i, headers)),
      ),
    ];
    const rows = lines.map(({ line, raw }) => makeRow(line, raw, columns));
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
    key: `${event.id}/${edition.date}/${def.id}`,
    eventId: event.id,
    date: edition.date,
    event,
    edition,
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
        for (const col of cols) {
          const value = row.at(col);
          out.push({
            value,
            raw: row.raw[col.index] ?? "",
            row,
            column: col,
            category,
            where: `${tsv}:${row.line} ${col.header}=${value}`,
          });
        }
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
 * @returns {{ headers: string[], lines: { line: number, raw: string[] }[] }}
 */
function splitTsv(text) {
  /** @type {string[] | null} */
  let headers = null;
  const lines = [];
  const physical = text.split("\n");
  for (let i = 0; i < physical.length; i++) {
    const line = physical[i];
    if (line.trim() === "") continue;
    const raw = stripCr(line).split("\t");
    if (headers === null) headers = raw.map((h) => h.trim());
    else lines.push({ line: i + 1, raw });
  }
  return { headers: headers ?? [], lines };
}

/** @param {string} line */
function stripCr(line) {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

/**
 * @param {number} line
 * @param {string[]} raw
 * @param {Column[]} columns
 * @returns {Row}
 */
function makeRow(line, raw, columns) {
  const cells = raw.map((c) => c.trim());
  /** @param {Column} col */
  const at = (col) => (col.index < 0 ? "" : (cells[col.index] ?? ""));
  return {
    line,
    raw,
    cells,
    at,
    get(role) {
      for (const col of columns) {
        if (col.role !== role) continue;
        const v = at(col);
        if (v !== "") return v;
      }
      return "";
    },
    all(role) {
      return columns.filter((c) => c.role === role).map(at);
    },
  };
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
