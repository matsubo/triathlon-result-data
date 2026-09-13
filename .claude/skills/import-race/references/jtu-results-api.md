# Jtu Results Api

> JTU has a deterministic JSON results API — use it instead of scraping the carousel-prone SPA

The JTU result pages (`https://www.jtu.or.jp/result/...`) are a JavaScript SPA with an **auto-rotating carousel that redirects to other events**, causing stale-DOM **cross-contamination** when scraped via Playwright (one event's table gets saved as another's). This has already corrupted committed data (e.g. `uminomori 2023` held 京都丹波 data; `fukuoka 2023` held 海の森 sprint data — both fixed 2026-05).

Use the **backing JSON API** instead — it is deterministic (keyed by result_table_id), immune to the carousel:
- Event + programs: `https://results.jtu.or.jp/api/events/search?cond[event_id]=NNN` → `res.body.events[0]` (event_name, event_date, event_location) + `res.body.programs[NNN][]` (program_id, program_name)
- Result tables for a program: `https://results.jtu.or.jp/api/programs/{program_id}/result_tables` → `res.body[].result_table_id`
- Rows: `https://results.jtu.or.jp/api/results?cond[result_table_id]=N` → `res.body.result_cols[]` (result_col_order, result_col_caption — may contain `\n`, strip it) + `res.body.result_list[]` (each row has `col_1`..`col_N`; null = empty)

URL-encode the brackets (`cond%5Bevent_id%5D`). Header = captions sorted by result_col_order; convert U+3000→half-width space only in the 氏名 column. When importing JTU editions, prefer this API and verify row counts; if a new edition's TSV is byte-identical to another event's, that's carousel contamination — fetch the correct table_id.

## Building the TSV from the API response

```bash
# 1. Event + program list (program_name tells you what to exclude: リレー/パラ/キッズ)
curl -s -g "https://results.jtu.or.jp/api/events/search?cond[event_id]=NNN"

# 2. Result tables for a program
curl -s -g "https://results.jtu.or.jp/api/programs/NNN_1/result_tables"

# 3. Rows (col_1..col_N map 1:1 to result_cols captions, null = empty cell)
curl -s -g "https://results.jtu.or.jp/api/results?cond[result_table_id]=NNNN"
```

NOTE: quote or `-g` the URL — `[]` in an unquoted URL breaks curl globbing.

- Header = `result_cols[].result_col_caption`, sorted by `result_col_order`, with embedded
  `\n` stripped.
- Some events use full-width spaces in 氏名 — convert to half-width (`名前　太郎` →
  `名前 太郎`). Only in the 氏名 column.
- Some columns are **constant division tags** (種別="エイジ"), not age brackets — map them
  to role `note`, never to a second `age_category`. A duplicate role mapping silently
  clobbers the real value.
- Filter out non-age-group programs per CLAUDE.md (キッズ / ジュニア / リレー / パラ /
  小学 / 中学 / アクアスロン / デュアスロン / ビギナー / チャレンジ) — and check for a
  division column *within* a table, not just per-program filtering.
