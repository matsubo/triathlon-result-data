import { existsSync, readFileSync, writeFileSync } from "node:fs";

const RACE_INFO_PATH = "race-info.json";

// Segment column role classification
const classifySegmentColumn = (header) => {
  // Lap times: contains ラップ or LAP
  if (/ラップ|LAP/i.test(header)) {
    return "lap";
  }

  // Rank columns: S順, B順, R順, 1R順, 2R順
  if (/^[SBR]順$|^[12]R順$/.test(header)) {
    return "rank";
  }

  // Transition: T1, T2
  if (/^T[12]$/.test(header)) {
    return "transition";
  }

  // Cumulative time: スプリット
  if (header === "スプリット") {
    return "cumulative_time";
  }

  // Cumulative rank: 通過, 通過順位
  if (header === "通過" || header === "通過順位") {
    return "cumulative_rank";
  }

  // Checkpoint: endings with F (スイムF, バイクF, ランF, FINISH)
  if (/F$|^FINISH$/.test(header)) {
    return "checkpoint";
  }

  // Checkpoint: endings with S (バイクS, ランS) - transition start checkpoint
  if (/S$/.test(header) && header !== "スプリット") {
    return "checkpoint";
  }

  // Checkpoint: distance markers
  if (
    /\d+km$|\d+$/.test(header) &&
    !/(順位|順)$/.test(header) &&
    !/^[12]R順$/.test(header)
  ) {
    return "checkpoint";
  }

  // Checkpoint: 折返 patterns
  if (/折返|折り返し/.test(header)) {
    return "checkpoint";
  }

  // Checkpoint: R25, R35, R折り返し
  if (/^R\d+$|^R折/.test(header)) {
    return "checkpoint";
  }

  return null;
};

// Meta column role classification
const META_ROLE_MAP = {
  総合順位: "overall_rank",
  "No.": "bib",
  氏名: "name",
  年齢: "age",
  性別: "gender",
  居住地: "residence",
  総合記録: "total_time",
  男子順位: "gender_rank",
  女子順位: "gender_rank",
  男子: "gender_rank",
  女子: "gender_rank",
  年齢区分: "age_category",
  年代区分: "age_category",
  区分: "age_category",
  選手権: "age_category",
  種別: "age_category",
  年齢別順: "age_rank",
  年代順位: "age_rank",
  年代別順: "age_rank",
  区分順位: "age_rank",
  選手権順: "age_rank",
  順位: "age_rank",
  ペナルティ: "penalty",
  ステータス: "status",
  備考: "status",
  ガイド氏名: "guide_name",
  市民順位: "citizen_rank",
  柏市民: "citizen_category",
  我孫子市民: "citizen_category",
};

const classifyMetaColumn = (header) => {
  return META_ROLE_MAP[header] || null;
};

const data = JSON.parse(readFileSync(RACE_INFO_PATH, "utf-8"));

let totalCategories = 0;
let totalSegmentColumns = 0;
let totalMetaColumns = 0;
const unmappedSegment = [];
const unmappedMeta = [];

const updatedEvents = data.events.map((event) => ({
  ...event,
  editions: event.editions.map((edition) => ({
    ...edition,
    categories: edition.categories.map((category) => {
      totalCategories++;

      // Read TSV headers
      const tsvPath = category.result_tsv;
      let tsvHeaders = [];
      if (existsSync(tsvPath)) {
        const firstLine = readFileSync(tsvPath, "utf-8")
          .split(/\r?\n/)[0]
          .replace(/^\uFEFF/, "");
        tsvHeaders = firstLine.split("\t").filter((h) => h.trim());
      }

      // Convert segment columns from string[] to {header, role}[]
      const allSegmentHeaders = new Set();
      const updatedSegments = category.segments.map((segment) => {
        if (!segment.columns) {
          return { ...segment };
        }
        const updatedColumns = segment.columns.map((header) => {
          allSegmentHeaders.add(header);
          totalSegmentColumns++;
          const role = classifySegmentColumn(header);
          if (!role) {
            unmappedSegment.push(`${tsvPath}: ${header}`);
          }
          return { header, role: role || "checkpoint" };
        });
        return { ...segment, columns: updatedColumns };
      });

      // Build meta_columns from TSV headers not in any segment
      const metaHeaders = tsvHeaders.filter((h) => !allSegmentHeaders.has(h));

      // Also filter out headers that look like segment columns (checkpoint patterns)
      // but aren't mapped to any segment - these are data gaps, not meta columns
      const metaColumns = [];
      for (const header of metaHeaders) {
        const segRole = classifySegmentColumn(header);
        if (segRole) {
          // This looks like a segment column but isn't in any segment definition
          // Skip it from meta_columns - it's a segment mapping gap
          continue;
        }
        const role = classifyMetaColumn(header);
        if (role) {
          totalMetaColumns++;
          metaColumns.push({ header, role });
        } else {
          unmappedMeta.push(`${tsvPath}: ${header}`);
        }
      }

      return {
        ...category,
        segments: updatedSegments,
        meta_columns: metaColumns,
      };
    }),
  })),
}));

const updatedData = { ...data, events: updatedEvents };

writeFileSync(RACE_INFO_PATH, `${JSON.stringify(updatedData, null, 2)}\n`);

console.log(`Processed ${totalCategories} categories`);
console.log(`Converted ${totalSegmentColumns} segment columns`);
console.log(`Created ${totalMetaColumns} meta columns`);

if (unmappedSegment.length > 0) {
  console.log(`\nUnmapped segment columns (defaulted to checkpoint):`);
  for (const item of unmappedSegment) {
    console.log(`  ${item}`);
  }
}
if (unmappedMeta.length > 0) {
  console.log(`\nUnmapped meta columns (skipped):`);
  for (const item of unmappedMeta) {
    console.log(`  ${item}`);
  }
}
