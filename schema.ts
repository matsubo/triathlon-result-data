/**
 * Triathlon Result Data Schema
 *
 * TypeScript type definitions generated from race-info-schema.json.
 * This is the canonical type definition for consuming applications.
 *
 * JSON Schema (race-info-schema.json) is the single source of truth.
 * These types are derived from it for TypeScript/JavaScript consumers.
 */

// ============================================================
// Enums
// ============================================================

/** Race distance/type classification */
export type DistanceType =
  | "LD" // Long Distance (e.g., Ironman)
  | "MD" // Middle Distance (e.g., 70.3)
  | "OD" // Olympic Distance
  | "SD" // Sprint Distance
  | "SS" // Super Sprint
  | "DUATHLON" // Run-Bike-Run
  | "AQUATHLON" // Swim-Run
  | "MARATHON" // Run only
  | "OTHER";

/** Sport type for each segment */
export type Sport = "swim" | "bike" | "run";

/** Semantic role of a column within a sport segment */
export type SegmentColumnRole =
  | "lap" // Total time for this segment
  | "checkpoint" // Intermediate checkpoint time
  | "rank" // Ranking within this segment
  | "transition" // Transition time (T1/T2)
  | "cumulative_time" // Cumulative split from race start
  | "cumulative_rank"; // Cumulative ranking at this point

/** Semantic role of a metadata column (not part of any segment) */
export type MetaColumnRole =
  | "overall_rank" // Overall finish position (may contain DNF/DNS/TOV/DSQ/OPEN)
  | "bib" // Bib/race number
  | "name" // Athlete name
  | "age" // Athlete age
  | "gender" // Gender
  | "residence" // Residence (prefecture/country)
  | "total_time" // Total finish time
  | "gender_rank" // Gender-based ranking
  | "age_category" // Age group category label
  | "age_rank" // Age group ranking
  | "penalty" // Penalty time/info
  | "status" // Race status (remarks, DNF reason)
  | "guide_name" // Guide name (para-triathlon)
  | "citizen_rank" // Local citizen ranking
  | "citizen_category"; // Local citizen category

/** Race status values that appear in overall_rank column */
export type RaceStatus =
  | "DNF" // Did Not Finish
  | "DNS" // Did Not Start
  | "DSQ" // Disqualified
  | "DQ" // Disqualified (variant)
  | "DNE" // Did Not Enter
  | "TOV" // Time Over (exceeded time limit)
  | "OPEN" // Open participation (non-competitive)
  | "SKIP"; // Skipped

// ============================================================
// Column Definitions
// ============================================================

/** A TSV column mapped to a sport segment with its semantic role */
export interface SegmentColumn {
  /** TSV column header name (exact match) */
  header: string;
  /** Semantic role of this column */
  role: SegmentColumnRole;
}

/** A TSV column for participant metadata */
export interface MetaColumn {
  /** TSV column header name (exact match) */
  header: string;
  /** Semantic role of this column */
  role: MetaColumnRole;
}

// ============================================================
// Core Data Model
// ============================================================

/** A sport segment within a race (e.g., swim leg, bike leg) */
export interface Segment {
  /** Sport type */
  sport: Sport;
  /** Distance in kilometers */
  distance: number;
  /** TSV columns belonging to this segment, with semantic roles */
  columns: SegmentColumn[];
}

/** A race category within an edition (e.g., Olympic Distance, Sprint) */
export interface Category {
  /** Unique identifier */
  id: string;
  /** Path to TSV result file (e.g., "master/2025/yokohama/result.tsv") */
  result_tsv: string;
  /** Category name in Japanese */
  name: string;
  /** Distance/type classification */
  distance: DistanceType;
  /** Ordered sport segments defining the race format */
  segments: Segment[];
  /** Description in Japanese */
  description: string;
  /** Metadata columns (participant info, rankings, status) */
  meta_columns: MetaColumn[];
}

/** A yearly occurrence of an event */
export interface Edition {
  /** Event date in YYYY-MM-DD format */
  date: string;
  /** Path to weather data JSON file */
  weather_file: string;
  /** Race categories within this edition */
  categories: Category[];
}

/** A race event (e.g., "横浜トライアスロン") */
export interface RaceEvent {
  /** Unique identifier */
  id: string;
  /** Event name in Japanese */
  name: string;
  /** Event location */
  location: string;
  /** Path to event image (webp) */
  image: string;
  /** Official website URL */
  source: string;
  /** Yearly editions */
  editions: Edition[];
}

/** Root data structure of race-info.json */
export interface RaceInfo {
  events: RaceEvent[];
}

// ============================================================
// TSV Row Types (for parsing result.tsv files)
// ============================================================

/** Time string in H:MM:SS format (e.g., "1:23:45", "0:05:30") */
export type TimeString = string;

/**
 * Overall rank value - either a numeric position or a race status flag.
 * Numeric values may contain commas (e.g., "1,234").
 * Status flags: DNF, DNS, DSQ, DQ, DNE, TOV, OPEN, SKIP
 */
export type OverallRankValue = string;

/**
 * A parsed TSV result row, keyed by semantic role.
 * Applications should use meta_columns and segment columns
 * from the Category schema to map TSV headers to these fields.
 */
export interface ParsedResultRow {
  // Meta fields
  overall_rank?: OverallRankValue;
  bib?: string;
  name?: string;
  age?: number;
  gender?: string;
  residence?: string;
  total_time?: TimeString;
  gender_rank?: number[];
  age_category?: string;
  age_rank?: number;
  penalty?: string;
  status?: string;
  guide_name?: string;
  citizen_rank?: number;
  citizen_category?: string;

  // Segment data - keyed by segment index
  segments?: ParsedSegmentData[];
}

/** Parsed data for a single sport segment */
export interface ParsedSegmentData {
  /** Total lap time for this segment */
  lap?: TimeString;
  /** Intermediate checkpoint times */
  checkpoints?: TimeString[];
  /** Ranking within this segment */
  rank?: number;
  /** Transition time to next segment */
  transition?: TimeString;
  /** Cumulative time from race start */
  cumulative_time?: TimeString;
  /** Cumulative ranking */
  cumulative_rank?: number;
}
