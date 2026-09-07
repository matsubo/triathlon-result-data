# Data Quality Gates

> Repo-wide data-quality gates added 2026-07-07: check:integrity baseline, 3 structural tsv-lint rules, known-issues registries, and the audit findings still open

On 2026-07-07 a senior-review audit of all 2844 categories / 3.76M athletes
added permanent quality gates to this repo:

- `bun run check:integrity` (scripts/check-integrity.js) — normalizes every
  edition, compares missing-lap/missing-total/header-warning counts per
  category against `integrity-baseline.json`, fails on regression only.
  `--update` rewrites the baseline (do this ONLY for source-inherent gaps,
  stated in the commit message). CI: .github/workflows/check-integrity.yml.
- tsv-lint gained 3 structural rules (time-format, rank-numeric,
  extra-columns) with `tsv-lint-known-issues.json` pinning pre-existing
  violations per file. Both registries are shrink-only to-fix lists.
- The post-import acceptance check is AGGREGATE stats, never sample rows —
  procedure lives in .claude/skills/race-data-import/SKILL.md §4.

Fixed during the audit (details in commits 7b0ea4a..52015c4): IRONMAN
99999-placeholder + ignored Status column (~586k athletes misclassified
as finished), parseTime rejecting MM:SS(.ff) (half of hiwasa's laps) and
"H:MM:SS P", status tokens SKP/NOF/NC/LAP/DQ/参考記録, nojiriko 2023
column swap, tokunoshima 2018 truncated-seconds reconstruction (exact,
verified via split-sum invariants), shirosato_tt 平均速度→lap mismap,
result-schema.json missing age_category_raw + trail_running. After all
fixes, all 2566 editions pass normalize-tsv end-to-end.

**Still-open findings** (in known-issues, need re-import from source):
- iseshima 2019: cells merged pairwise ("11:32 22:41" in one cell), 5854
  rank-cell violations — needs full PDF re-extraction.
- yokohama 2012-2024 (default+sprint): data rows 1 column wider than
  header (~8k rows) — a header column was dropped at import.
- amakusa 2024/2025, irago 2015/2025, numadu 2025 (順位="個人" rows),
  teganuma 2014-2016/2025, komatsu_tetsujin various: row-level column
  shifts / bracket text in rank columns.
- ako 2017: 総合記録+ラン columns entirely empty at source; murakami
  2016-2019: DNFs carry sequential rank numbers (source style).

`sport-enum-schema-gap` is RESOLVED by this audit (both
age_category_raw and trail_running now in result-schema.json).
