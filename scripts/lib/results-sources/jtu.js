/**
 * JTU Results source adapter (the deterministic results.jtu.or.jp JSON API;
 * the jtu.or.jp SPA carousel cross-contaminates tables and is not used).
 *
 * `fetch({ program, columns })` resolves the program's single result table and
 * returns its rows with captions in `result_col_order`, `\n` stripped. Column
 * roles come from one caption vocabulary, matched after NFKC folding and
 * whitespace removal, so half-width kana (ｽｲﾑﾗｯﾌﾟ) and full-width letters (Ｓ順)
 * resolve too. The TSV keeps each caption verbatim unless `columns.rename`
 * says otherwise. An unknown caption is an error: rename or drop it.
 */

const API = "https://results.jtu.or.jp/api";
const USER_AGENT = "Mozilla/5.0";

/** @typedef {import("../import.js").SourceTable} SourceTable */
/** @typedef {import("../import.js").SourceColumn} SourceColumn */
/**
 * @typedef {object} JtuColumnOptions
 * @property {Record<string, string>} [rename] caption → TSV header (applied before role lookup)
 * @property {string[]} [drop] captions to leave out ("" is the null-caption slug column)
 * @property {{header: string, value: string, after: string}[]} [constants] constant columns inserted after a (renamed) header
 */

/** @type {Record<string, string>} caption (NFKC, no whitespace) → meta role */
const META = {
  総合順位: "overall_rank",
  "No.": "bib",
  氏名: "name",
  年齢: "age",
  性別: "gender",
  居住地: "residence",
  登録地: "residence",
  都道府県: "residence",
  TRIJ登録地: "residence",
  JTU登録地: "residence",
  所属: "residence",
  "所属/登録": "residence",
  総合記録: "total_time",
  PNLT: "penalty",
  加算分: "penalty",
  ペナルティ: "penalty",
  男子順位: "gender_rank",
  女子順位: "gender_rank",
  男女別順: "gender_rank",
  年齢区分: "age_category",
  年代区分: "age_category",
  区分: "age_category",
  年齢別順: "age_rank",
  年齡別順: "age_rank",
  年代別順: "age_rank",
  区分順位: "age_rank",
  川崎市: "citizen_category",
  川崎市順位: "citizen_rank",
  選手権順: "championship_rank",
  // A constant division tag (種別="エイジ"), never a second age_category.
  種別: "note",
  JTU番号: "note",
  東北順位: "note",
  福島順位: "note",
};

/** @type {Record<string, [string, string]>} caption (NFKC, no whitespace) → [sport, segment role] */
const SEG = {
  スイムラップ: ["swim", "lap"],
  スイム: ["swim", "lap"],
  SWIM: ["swim", "lap"],
  S順: ["swim", "rank"],
  T1: ["swim", "transition"],
  // Yamagata Zao: a short structural jog from the lake to T1, modelled as T1.
  ミニラン: ["swim", "transition"],
  バイクラップ: ["bike", "lap"],
  バイク: ["bike", "lap"],
  B順: ["bike", "rank"],
  スプリット: ["bike", "cumulative_time"],
  通過: ["bike", "cumulative_rank"],
  T2: ["bike", "transition"],
  ランラップ: ["run", "lap"],
  ラン: ["run", "lap"],
  R順: ["run", "rank"],
};

/** Captions the repository keeps in the TSV without a Column role. */
const UNMAPPED = new Set(["YOB"]);

/** @param {string} s */
const fold = (s) => s.normalize("NFKC").replace(/\s+/g, "");

/**
 * Column role of a JTU caption, or null when the caption is known but unmapped.
 * @param {string} header
 * @returns {Omit<SourceColumn, "header"> | null}
 */
export function jtuCaptionRole(header) {
  const key = fold(header);
  if (META[key]) return { role: META[key] };
  if (SEG[key]) return { role: SEG[key][1], sport: SEG[key][0] };
  if (UNMAPPED.has(key)) return null;
  throw new Error(`unknown JTU caption ${JSON.stringify(header)}`);
}

/**
 * @param {{ fetch?: typeof fetch }} [options] `fetch` is injectable so tests replay recorded payloads
 */
export function jtuSource({ fetch: doFetch = fetch } = {}) {
  /** @param {string} url */
  async function body(url) {
    const res = await doFetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`JTU API ${res.status} for ${url}`);
    const json = /** @type {any} */ (await res.json());
    // Every endpoint wraps its payload in res.body; a wrong key reads as "no data".
    if (!json?.res || !("body" in json.res))
      throw new Error(`JTU API: no res.body in ${url}`);
    return json.res.body;
  }

  return {
    /**
     * @param {{ program: string, columns?: JtuColumnOptions }} request
     * @returns {Promise<SourceTable>}
     */
    async fetch({ program, columns: opts = {} }) {
      const tables = await body(`${API}/programs/${program}/result_tables`);
      if (!Array.isArray(tables) || tables.length !== 1)
        throw new Error(
          `JTU program ${program}: expected exactly 1 result table, got ${Array.isArray(tables) ? tables.length : "none"}`,
        );
      const tid = tables[0].result_table_id;
      const r = await body(`${API}/results?cond%5Bresult_table_id%5D=${tid}`);
      /** @type {any[]} */
      const cols = [...r.result_cols].sort(
        (a, b) => a.result_col_order - b.result_col_order,
      );
      const captions = cols.map((c) =>
        String(c.result_col_caption ?? "").replace(/\n/g, ""),
      );
      /** @type {string[][]} */
      let rows = r.result_list.map((/** @type {any} */ row) =>
        cols.map((_, i) => {
          const v = row[`col_${i + 1}`];
          // The elite tables zero-pad the hour ("00:55:32").
          return v == null
            ? ""
            : String(v).replace(/^0(\d:\d{2}:\d{2})$/, "$1");
        }),
      );

      const drop = new Set(opts.drop ?? []);
      const rename = opts.rename ?? {};
      for (const k of [...drop, ...Object.keys(rename)])
        if (!captions.includes(k))
          throw new Error(
            `JTU program ${program}: column option names caption ${JSON.stringify(k)}, which the table does not have`,
          );
      const keep = captions
        .map((_, i) => i)
        .filter((i) => !drop.has(captions[i]));
      let headers = keep.map((i) => rename[captions[i]] ?? captions[i]);
      rows = rows.map((row) => keep.map((i) => row[i]));

      for (const c of opts.constants ?? []) {
        const at = headers.indexOf(c.after);
        if (at < 0)
          throw new Error(
            `JTU program ${program}: constant ${c.header} goes after ${JSON.stringify(c.after)}, which is not a header`,
          );
        headers = [
          ...headers.slice(0, at + 1),
          c.header,
          ...headers.slice(at + 1),
        ];
        rows = rows.map((row) => [
          ...row.slice(0, at + 1),
          c.value,
          ...row.slice(at + 1),
        ]);
      }

      /** @type {SourceColumn[]} */
      const columns = [];
      /** @type {string[]} */
      const unmapped = [];
      for (const h of headers) {
        let role;
        try {
          role = jtuCaptionRole(h);
        } catch (err) {
          throw new Error(
            `JTU program ${program}: ${/** @type {Error} */ (err).message}; rename or drop it`,
          );
        }
        if (role) columns.push({ header: h, ...role });
        else unmapped.push(h);
      }

      return {
        headers,
        rows,
        columns,
        unmapped,
        source_url: `${API}/results?cond[result_table_id]=${tid}`,
      };
    },
  };
}
