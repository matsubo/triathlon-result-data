---
description: Check IRONMAN and JTU result sources and import any race editions not yet in this repository.
argument-hint: "[ironman|jtu] [year]   (optional — defaults to both sources, current & previous year)"
---

# Import missing race editions

Check the IRONMAN and JTU result sources for race editions that are **not yet imported**
into this repository, and import any that are missing.

**Scope (from `$ARGUMENTS`):**
- No arguments → check **both** IRONMAN and JTU, for the current and previous year.
- `ironman` / `jtu` → restrict to that one source.
- A 4-digit year → restrict to that year.

## Required reading first

1. Invoke the **`race-data-import`** skill — it holds the mandatory checklist (image
   policy, TSV column alignment, build & validate pipeline). Follow it for every edition.
2. Re-read `CLAUDE.md` → "新規大会データの取り込み手順" for the JTU result-system URL
   scheme, `event_id` year ranges, the Playwright scraping pattern, and which categories
   to filter out (キッズ / ジュニア / リレー / パラ / アクアスロン / デュアスロン etc.).

## Procedure

1. **Inventory what already exists.** Read `race-info.json` and build the set of
   `(event, year)` editions already imported. Do not re-import these.

2. **Discover candidates from each in-scope source:**
   - **JTU**: list programs via `https://www.jtu.or.jp/result_program/?event_id={ID}`
     across the year's `event_id` range (see CLAUDE.md). Use the **playwright-cli** skill /
     Playwright — these pages load results dynamically.
   - **IRONMAN**: check the official IRONMAN results for editions of events already in our
     `events` array (and notable new ones), comparing against the existing `editions`.

3. **Diff** discovered editions against the inventory from step 1. Produce a list of
   missing `(event, year)` editions. **Show me this list and confirm before importing.**

4. **Import each missing edition**, delegating to the existing agents:
   - `race-result-scraper` → fetch the result table → `master/<year>/<id>/result.tsv`
     (half-width space between surname and given name; main age-group categories only).
   - `race-info-updater` → add the event/edition to `race-info.json` with correct
     `segments` / `columns` / `meta_columns` mapping.
   - `weather-data-generator` → create `master/<year>/<id>/weather-data.json` from JMA data.
   - Add a unique `.webp` image (≤600×400) per the image policy in the skill — never reuse
     a placeholder.

5. **Validate** (per the skill's pipeline):
   ```bash
   bunx ajv-cli validate -s race-info-schema.json -d race-info.json
   bunx ajv-cli validate -s weather-schema.json -d master/<year>/<id>/weather-data.json
   bun scripts/normalize-tsv.js <event_id> <year>
   bun run build:schema
   bun test
   ```
   Run `bun run check:duplicates` to confirm no duplicate editions were introduced.

6. **Report** what was imported (events, editions, athlete counts) and what was skipped
   (and why). **Do not commit or push** — leave the changes staged for my review.
