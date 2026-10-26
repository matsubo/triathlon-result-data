/**
 * IRONMAN Results source adapter (labs-v2.competitor.com).
 *
 * `fetch({ id, template })` returns one subevent's results as a SourceTable in
 * the repository's IRONMAN TSV layout. The adapter owns the canonical templates
 * for full and 70.3 Categories: the header list and its Column roles, the
 * Category name, the Distance class and the default Segment distances.
 *
 * Kept as published (the normalizer handles them): `99999` overall / division
 * rank placeholders, DNF / DNS / DQ in Status, an empty Status for finishers.
 */

const API_BASE = "https://labs-v2.competitor.com/api/results";
// labs-v2 answers 403 to clients without a browser User-Agent.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/** @typedef {import("../import.js").SourceTable} SourceTable */
/** @typedef {import("../import.js").SourceColumn} SourceColumn */
/** @typedef {"full" | "70.3"} IronmanTemplate */

/** @type {SourceColumn[]} */
const COLUMNS = [
  { header: "ContactId", role: "athlete_id" },
  { header: "Overall_Rank", role: "overall_rank" },
  { header: "Name", role: "name" },
  { header: "Gender", role: "gender" },
  { header: "Division", role: "age_category" },
  { header: "Div_Rank", role: "age_rank" },
  { header: "Total_Time", role: "total_time" },
  { header: "Swim", role: "lap", sport: "swim" },
  { header: "Bike", role: "lap", sport: "bike" },
  { header: "Run", role: "lap", sport: "run" },
  { header: "Country", role: "residence" },
  { header: "Status", role: "status" },
];
const HEADERS = [
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
const UNMAPPED = ["T1", "T2"];

/** @type {Record<IronmanTemplate, {name: string, distance_class: "LD" | "MD", segments: {sport: "swim" | "bike" | "run", distance: number}[]}>} */
export const IRONMAN_TEMPLATES = {
  full: {
    name: "Full Distance",
    distance_class: "LD",
    segments: [
      { sport: "swim", distance: 3.8 },
      { sport: "bike", distance: 180.2 },
      { sport: "run", distance: 42.195 },
    ],
  },
  70.3: {
    name: "Half Distance",
    distance_class: "MD",
    segments: [
      { sport: "swim", distance: 1.9 },
      { sport: "bike", distance: 90 },
      { sport: "run", distance: 21.1 },
    ],
  },
};

/** @param {number | null | undefined} seconds */
function formatTime(seconds) {
  // A negative duration is a source-side error (seen on 70.3 Belgrade 2026 T1/T2).
  if (seconds == null || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** @param {number | undefined} code */
function formatGender(code) {
  if (code === 1) return "M";
  if (code === 2) return "F";
  return "";
}

/**
 * @param {any} r one `resultsJson.value[]` row
 * @returns {string[]}
 */
function toRow(r) {
  let status = "";
  if (r.wtc_dnf) status = "DNF";
  else if (r.wtc_dns) status = "DNS";
  else if (r.wtc_dq) status = "DQ";
  return [
    r.wtc_ContactId?.contactid || "",
    String(r.wtc_finishrankoverall || ""),
    // The source occasionally carries doubled spaces ("Rodrigo Cañete  Galeano").
    (r.wtc_ContactId?.fullname || r.athlete || "").replace(/\s+/g, " ").trim(),
    formatGender(r.wtc_ContactId?.gendercode),
    r.wtc_AgeGroupId?.wtc_agegroupname || "",
    String(r.wtc_finishrankgroup || ""),
    formatTime(r.wtc_finishtime),
    formatTime(r.wtc_swimtime),
    formatTime(r.wtc_transition1time),
    formatTime(r.wtc_biketime),
    formatTime(r.wtc_transition2time),
    formatTime(r.wtc_runtime),
    // The controlled "country representing" name resolves to ISO2 downstream;
    // address1_country is athlete-entered free text (US/USA/deu/are...).
    r._wtc_countryrepresentingid_value_formatted ||
      r.wtc_ContactId?.address1_country ||
      "",
    status,
  ];
}

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {{ fetch?: typeof fetch, delayMs?: number }} [options]
 *   `fetch` is injectable so tests replay recorded payloads; `delayMs` is the
 *   minimum gap between two requests (politeness towards the API).
 */
export function ironmanSource({ fetch: doFetch = fetch, delayMs = 2000 } = {}) {
  let last = 0;
  return {
    /**
     * @param {{ id: string, template: IronmanTemplate }} request
     * @returns {Promise<SourceTable>}
     */
    async fetch({ id, template }) {
      const tpl = IRONMAN_TEMPLATES[template];
      if (!tpl) throw new Error(`unknown IRONMAN template ${template}`);
      const wait = last + delayMs - Date.now();
      if (wait > 0) await sleep(wait);
      const url = `${API_BASE}?wtc_eventid=${id}`;
      let res;
      try {
        res = await doFetch(url, { headers: { "User-Agent": USER_AGENT } });
      } finally {
        last = Date.now();
      }
      if (!res.ok) throw new Error(`IRONMAN API ${res.status} for ${url}`);
      const json = /** @type {any} */ (await res.json());
      /** @type {any[]} */
      const results = json.resultsJson?.value || [];
      // Finishers by overall rank first; unranked (DNF/DNS/DQ) last.
      const sorted = [...results].sort(
        (a, b) =>
          (a.wtc_finishrankoverall || 99999) -
          (b.wtc_finishrankoverall || 99999),
      );
      return {
        headers: [...HEADERS],
        rows: sorted.map(toRow),
        columns: COLUMNS.map((c) => ({ ...c })),
        unmapped: [...UNMAPPED],
        source_url: null,
        segments: tpl.segments.map((s) => ({ ...s })),
        name: tpl.name,
        distance_class: tpl.distance_class,
      };
    },
  };
}
