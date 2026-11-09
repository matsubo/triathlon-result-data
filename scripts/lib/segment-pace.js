/**
 * Segment pace: is each Segment's declared distance consistent with the times
 * raced on it?
 *
 *   segmentMedians(category) → one SegmentMedian per Segment
 *   checkPace(categories)    → one PaceCheck per measured Segment
 *   paceWarnings(repo, eventId, date) → Import warnings for one Edition
 *
 * A Segment's median lap is taken over the finished Athletes of its Category
 * (read through the Category reader and the normalizers). The lap of an
 * Athlete comes from, in order:
 *
 *   - lap:         the Segment's lap column(s); several lap columns are summed
 *   - checkpoints: the Segment's checkpoint columns summed (splits inside it)
 *   - cumulative:  its cumulative time minus the previous Segment's (includes
 *                  the transition)
 *   - total:       the total time minus every other Segment's lap and every
 *                  transition, when this is the only Segment no column measures
 *
 * A Segment is skipped (not measured) when its distance is 0 or missing, no
 * column measures it, or fewer than MIN_LAPS finishers have a lap.
 *
 * Two flags, each a hint that the declared distance is not the course raced
 * (a swim cut short, a distance copied from the entry guidelines or the
 * previous Edition):
 *
 *   - band:    the implied pace lies outside the sport's PACE_BANDS, which are
 *              calibrated on the medians of the whole corpus
 *   - edition: the median differs by more than MAX_EDITION_RATIO from the
 *              median of the same Event's other Editions at the same Segment
 *              (same Category id or Distance class, same Segment position and
 *              sport, same declared km)
 *
 * The implied distance is the median lap at the Event's normal pace for the
 * sport (the median pace of its other Editions, or the band's typical pace).
 */
import { buildAthlete } from "./build-athlete.js";
import { readCategories } from "./category-reader.js";
import { parseTime } from "./normalize-time.js";

/**
 * @typedef {import("./category-reader.js").Category} Category
 * @typedef {import("./category-reader.js").Column} Column
 * @typedef {import("./repo.js").Repo} Repo
 *
 * @typedef {"lap" | "checkpoints" | "cumulative" | "total"} LapSource
 *
 * @typedef {object} SegmentMedian
 * @property {number} index position in the Category's Segments
 * @property {string} sport
 * @property {number} km declared distance (0 when absent)
 * @property {LapSource | null} source
 * @property {number} laps finishers with a lap
 * @property {number | null} median median lap in seconds; null when skipped
 * @property {string | null} skipped why the Segment is not measured
 *
 * @typedef {object} PaceBand pace edges in the sport's unit (PACE_UNITS)
 * @property {number} min lower edge
 * @property {number} max upper edge
 * @property {number} typical median of the corpus medians
 *
 * @typedef {object} PaceCheck
 * @property {Category} category
 * @property {SegmentMedian & { median: number }} segment
 * @property {number} pace implied pace in the sport's unit (PACE_UNITS)
 * @property {PaceBand | null} band
 * @property {boolean} outsideBand
 * @property {number | null} reference median lap of the other Editions, null without peers
 * @property {number} peers Editions behind `reference`
 * @property {number | null} ratio median / reference
 * @property {boolean} offEditions ratio beyond MAX_EDITION_RATIO
 * @property {number} impliedKm median lap at the Event's normal pace
 * @property {number} severity 0 when not flagged; larger is worse
 */

/** Finishers needed for a median. */
export const MIN_LAPS = 5;

/** A median this many times slower (or faster) than the other Editions' is flagged. */
export const MAX_EDITION_RATIO = 1.4;

/**
 * The unit each sport's pace is expressed in: swim seconds per 100 m, bike
 * km/h, run and trail running seconds per km.
 * @type {Record<string, { unit: string, pace: (seconds: number, km: number) => number, km: (seconds: number, pace: number) => number, format: (pace: number) => string }>}
 */
export const PACE_UNITS = {
  swim: {
    unit: "/100m",
    pace: (s, km) => s / (km * 10),
    km: (s, pace) => s / pace / 10,
    format: (p) => `${clock(p)}/100m`,
  },
  bike: {
    unit: "km/h",
    pace: (s, km) => km / (s / 3600),
    km: (s, pace) => (pace * s) / 3600,
    format: (p) => `${p.toFixed(1)} km/h`,
  },
  run: {
    unit: "/km",
    pace: (s, km) => s / km,
    km: (s, pace) => s / pace,
    format: (p) => `${clock(p)}/km`,
  },
};
PACE_UNITS.trail_running = PACE_UNITS.run;

/**
 * Plausible median paces, calibrated on the medians of every Category of the
 * corpus (`bun scripts/report-segment-pace.js` prints the
 * distribution). Each edge sits in a gap of that distribution, past the last
 * value a real course produces: elite championship swims (1:10/100m), Mt Fuji
 * hill climbs (14 km/h), elite runs (3:23/km), hot LD marathons (8:47/km).
 * Beyond the edges the corpus holds only cut swims, laps of the wrong column
 * and wrong distances. Trail running has no band: elevation makes any pace
 * plausible.
 * @type {Record<string, PaceBand | null>}
 */
export const PACE_BANDS = {
  swim: { min: 60, max: 240, typical: 125 },
  bike: { min: 13, max: 45, typical: 29.6 },
  run: { min: 190, max: 540, typical: 362 },
  trail_running: null,
};

/** @param {number} seconds */
export function clock(seconds) {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** @param {number[]} values */
export function median(values) {
  const v = [...values].sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** @type {WeakMap<Category, SegmentMedian[]>} */
const medians = new WeakMap();

/**
 * The median lap of each of the Category's Segments over its finishers.
 * @param {Category} category
 * @returns {SegmentMedian[]}
 */
export function segmentMedians(category) {
  const cached = medians.get(category);
  if (cached) return cached;
  const segments = /** @type {{ sport: string, distance?: number }[]} */ (
    category.def.segments ?? []
  );
  const present = (/** @type {string} */ role, /** @type {number} */ i) =>
    category.columns(role, { segment: i }).filter((c) => c.index >= 0);
  const plan = segments.map((_, i) => {
    for (const [source, role] of /** @type {const} */ ([
      ["lap", "lap"],
      ["checkpoints", "checkpoint"],
      ["cumulative", "cumulative_time"],
    ])) {
      const cols = present(role, i);
      if (cols.length > 0) return { source, cols };
    }
    return null;
  });
  const unmeasured = plan.filter((p) => p === null).length;
  const totalCol = category
    .columns("total_time", { segment: null })
    .some((c) => c.index >= 0);
  const transitions = category
    .columns("transition")
    .filter((c) => c.index >= 0);

  /** @type {number[][]} */
  const laps = segments.map(() => []);
  if (category.text !== null) {
    const columns = category.columns();
    for (const row of category.rows) {
      const athlete = buildAthlete(row, columns, segments.length);
      if (athlete.name === "" || athlete.status !== "finished") continue;
      /** @param {Column[]} cols */
      const sum = (cols) => {
        let total = 0;
        for (const c of cols) {
          const t = parseTime(row.at(c));
          if (t === null) return null;
          total += t;
        }
        return total;
      };
      /** @type {(number | null)[]} */
      const own = plan.map((p, i) => {
        if (p === null) return null;
        if (p.source !== "cumulative") return sum(p.cols);
        const at = sum(p.cols);
        if (at === null || i === 0) return at;
        const prev = present("cumulative_time", i - 1);
        const before = prev.length > 0 ? sum(prev) : null;
        return before === null ? null : at - before;
      });
      if (unmeasured === 1 && totalCol && athlete.total_time_seconds !== null) {
        const gap = plan.indexOf(null);
        const others = own.filter((_, i) => i !== gap);
        if (others.every((t) => t !== null)) {
          let rest = athlete.total_time_seconds;
          for (const t of others) rest -= /** @type {number} */ (t);
          for (const c of transitions) rest -= parseTime(row.at(c)) ?? 0;
          own[gap] = rest;
        }
      }
      own.forEach((t, i) => {
        if (t !== null && t > 0) laps[i].push(t);
      });
    }
  }

  const result = segments.map((s, i) => {
    const km = s.distance ?? 0;
    /** @type {LapSource | null} */
    const source =
      plan[i]?.source ?? (unmeasured === 1 && totalCol ? "total" : null);
    const n = laps[i].length;
    /** @type {string | null} */
    let skipped = null;
    if (!(km > 0)) skipped = "no distance";
    else if (category.text === null) skipped = "no TSV";
    else if (source === null) skipped = "no lap column";
    else if (n < MIN_LAPS) skipped = `${n} finisher laps`;
    return {
      index: i,
      sport: s.sport,
      km,
      source,
      laps: n,
      median: skipped === null ? median(laps[i]) : null,
      skipped,
    };
  });
  medians.set(category, result);
  return result;
}

/**
 * Check every measured Segment of the given Categories. Each Category is
 * compared with the other Editions of its Event among `categories`, so pass
 * the whole Event (or the corpus).
 * @param {Category[]} categories
 * @returns {PaceCheck[]}
 */
export function checkPace(categories) {
  /** @type {Map<string, Category[]>} */
  const byEvent = new Map();
  for (const c of categories) {
    const list = byEvent.get(c.eventId);
    if (list) list.push(c);
    else byEvent.set(c.eventId, [c]);
  }
  /** @type {PaceCheck[]} */
  const checks = [];
  for (const cats of byEvent.values()) {
    const measured = cats.flatMap((category) =>
      segmentMedians(category)
        .filter((s) => s.median !== null)
        .map((s) => ({
          category,
          segment: /** @type {SegmentMedian & { median: number }} */ (s),
          pace: PACE_UNITS[s.sport].pace(
            /** @type {number} */ (s.median),
            s.km,
          ),
        })),
    );
    for (const { category, segment, pace } of measured) {
      const band = PACE_BANDS[segment.sport] ?? null;
      const others = measured.filter((m) => m.category.date !== category.date);
      const peers = others.filter(
        (m) =>
          (m.category.def.id === category.def.id ||
            m.category.def.distance === category.def.distance) &&
          m.segment.index === segment.index &&
          m.segment.sport === segment.sport &&
          m.segment.km === segment.km,
      );
      /** @type {Map<string, number[]>} */
      const byDate = new Map();
      for (const p of peers) {
        const list = byDate.get(p.category.date);
        if (list) list.push(p.segment.median);
        else byDate.set(p.category.date, [p.segment.median]);
      }
      const reference =
        byDate.size > 0 ? median([...byDate.values()].map(median)) : null;
      const ratio = reference === null ? null : segment.median / reference;
      const offEditions =
        ratio !== null &&
        (ratio > MAX_EDITION_RATIO || ratio < 1 / MAX_EDITION_RATIO);
      const bandExcess =
        band === null
          ? 0
          : pace < band.min
            ? Math.log(band.min / pace)
            : pace > band.max
              ? Math.log(pace / band.max)
              : 0;
      const normal = others
        .filter((m) => m.segment.sport === segment.sport)
        .map((m) => m.pace);
      const normalPace =
        normal.length > 0 ? median(normal) : (band?.typical ?? pace);
      checks.push({
        category,
        segment,
        pace,
        band,
        outsideBand: bandExcess > 0,
        reference,
        peers: byDate.size,
        ratio,
        offEditions,
        impliedKm: PACE_UNITS[segment.sport].km(segment.median, normalPace),
        severity:
          bandExcess +
          (offEditions ? Math.abs(Math.log(/** @type {number} */ (ratio))) : 0),
      });
    }
  }
  return checks;
}

/**
 * Why a flagged Segment looks wrong, as one line.
 * @param {PaceCheck} check
 */
export function describePace(check) {
  const { category, segment, pace, band, ratio, reference, peers } = check;
  const units = PACE_UNITS[segment.sport];
  const segments = /** @type {{ sport: string }[]} */ (
    category.def.segments ?? []
  );
  const same = (/** @type {{ sport: string }} */ s) =>
    s.sport === segment.sport;
  const leg =
    segments.filter(same).length > 1
      ? `${segment.sport} ${segments.slice(0, segment.index + 1).filter(same).length}`
      : segment.sport;
  /** @type {string[]} */
  const why = [units.format(pace)];
  if (check.outsideBand && band) {
    why[0] += `, outside the plausible ${
      segment.sport === "bike"
        ? `${band.min}–${band.max} km/h`
        : `${clock(band.min)}–${units.format(band.max)}`
    }`;
  }
  if (check.offEditions && ratio !== null && reference !== null) {
    const pct = Math.round(Math.abs(ratio - 1) * 100);
    why.push(
      `${pct}% ${ratio < 1 ? "faster" : "slower"} than the ${clock(reference)} median of ${peers} other Edition${peers > 1 ? "s" : ""} of this Event at ${segment.km} km`,
    );
  }
  return `${category.def.id}: ${leg} median ${clock(segment.median)} for ${segment.km} km (${why.join("; ")}; about ${kmText(check.impliedKm)} km at this Event's usual pace): check the race-day course`;
}

/** @param {number} km */
const kmText = (km) =>
  km >= 10 ? String(Math.round(km)) : String(Math.round(km * 100) / 100);

/**
 * Import warnings for one Edition: one line per flagged Segment, compared
 * with the Event's other Editions in `repo`.
 * @param {Repo} repo
 * @param {string} eventId
 * @param {string} date
 * @returns {string[]}
 */
export function paceWarnings(repo, eventId, date) {
  const { categories } = readCategories(repo, { eventId });
  return checkPace(categories)
    .filter((c) => c.category.date === date && c.severity > 0)
    .map(describePace);
}
