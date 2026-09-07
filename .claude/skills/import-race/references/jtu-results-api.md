# Jtu Results Api

> JTU has a deterministic JSON results API — use it instead of scraping the carousel-prone SPA

The JTU result pages (`https://www.jtu.or.jp/result/...`) are a JavaScript SPA with an **auto-rotating carousel that redirects to other events**, causing stale-DOM **cross-contamination** when scraped via Playwright (one event's table gets saved as another's). This has already corrupted committed data (e.g. `uminomori 2023` held 京都丹波 data; `fukuoka 2023` held 海の森 sprint data — both fixed 2026-05).

Use the **backing JSON API** instead — it is deterministic (keyed by result_table_id), immune to the carousel:
- Event + programs: `https://results.jtu.or.jp/api/events/search?cond[event_id]=NNN` → `res.body.events[0]` (event_name, event_date, event_location) + `res.body.programs[NNN][]` (program_id, program_name)
- Result tables for a program: `https://results.jtu.or.jp/api/programs/{program_id}/result_tables` → `res.body[].result_table_id`
- Rows: `https://results.jtu.or.jp/api/results?cond[result_table_id]=N` → `res.body.result_cols[]` (result_col_order, result_col_caption — may contain `\n`, strip it) + `res.body.result_list[]` (each row has `col_1`..`col_N`; null = empty)

URL-encode the brackets (`cond%5Bevent_id%5D`). Header = captions sorted by result_col_order; convert U+3000→half-width space only in the 氏名 column. See `sport-enum-schema-gap` for the segment-sport mapping caveat. When importing JTU editions, prefer this API and verify row counts; if a new edition's TSV is byte-identical to another event's, that's carousel contamination — fetch the correct table_id.
