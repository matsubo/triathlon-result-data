---
name: import-race
description: Check IRONMAN and JTU result sources and import any race editions not yet in this repository. Use when asked to import missing race editions, check for new race results, or fill the gap since the last import run. Accepts an optional scope argument, "ironman" or "jtu" to restrict the source and/or a 4-digit year to restrict the year.
---

# Import missing race editions

Check the IRONMAN and JTU result sources for race editions that are **not yet imported**
into this repository, and import any that are missing.

**Scope** — from the invocation arguments, if any: `$ARGUMENTS`
- No arguments → check **both** IRONMAN and JTU, for the current and previous year.
- `ironman` / `jtu` → restrict to that one source.
- A 4-digit year → restrict to that year.

## Required reading first

1. Invoke the **`race-data-import`** skill — it holds the mandatory checklist (image
   policy, TSV column alignment, source-specific fetch recipes, the post-import aggregate
   audit, and the build & validate pipeline). Follow it for every edition.
2. Read **`references/discovery.md`** — the accumulated discovery playbook: how to
   enumerate candidates deterministically from each source, the traps that have actually
   bitten past runs (duplicate event ids, PRO-only partial results, swim cancellations,
   returning races), and a dated log of per-run learnings.
3. Re-read `CLAUDE.md` → "新規大会データの取り込み手順" for the repository's data
   conventions and which categories to filter out (キッズ / ジュニア / リレー / パラ /
   アクアスロン / デュアスロン etc.).

Other references in this skill, consult as the source demands:

| File | Use for |
|---|---|
| `references/jtu-results-api.md` | JTU JSON result API shapes |
| `references/runnet-results-api.md` | RunNet-hosted domestic races |
| `references/mikatiming-csv-import.md` | Challenge Roth and other mikatiming CSV results |
| `references/teganuma-pdf-import.md` | PDF results (pdfplumber recipes) |
| `references/name-space-fix-methodology.md` | Restoring the 姓 / 名 half-width space |
| `references/weather-data-policy.md` | Which editions need weather, and from which source |
| `references/aquathlon-import-policy.md`, `references/duathlon-import-policy.md` | Whether a non-triathlon event is in scope |
| `references/data-quality-gates.md` | The gates an import must pass before commit |

**Host prerequisites:** `bun`, `node`, `python3` (with `pdfplumber` for PDF sources),
`magick` (ImageMagick 7, for images), `curl`. No host-local state is required — everything
this workflow needs is in the repository.

## Procedure

1. **Inventory what already exists.** Read `race-info.json` and build the set of
   `(event, date)` editions already imported. Editions key off `edition.date`, not a
   `year` field. Do not re-import these. Also check `git status` — a previous run may have
   left an unreviewed batch staged; build on top of it rather than duplicating it.

2. **Discover candidates from each in-scope source** (full recipes in
   `references/discovery.md`):
   - **JTU**: sweep the results JSON API,
     `https://results.jtu.or.jp/api/events/search?cond%5Bevent_id%5D=NNN`, across the
     year's `event_id` range — ids run chronologically by race date, so start a few below
     the previously confirmed ceiling and walk up until ids come back empty. Do **not**
     scrape the `jtu.or.jp/result_program` SPA; its carousel duplicates rows.
   - **IRONMAN**: read `scripts/ironman-site-event-uuids.json` (slug → event uuid, built
     from the ironman.com sitemap) and fetch each
     `https://labs-v2.competitor.com/results/event/<uuid>` page, extracting
     `__NEXT_DATA__` → `props.pageProps.subevents[]`. Keep subevents whose
     `wtc_eventdate` falls in the window and is on or before today.

3. **Diff** discovered editions against the inventory from step 1. Produce a list of
   missing `(event, date)` editions.
   - Cross-check every "already imported" verdict by **date**, not by an `event_id=` grep
     on `source_url` — many editions carry a blank `source_url`.
   - Cross-check every "new event" claim by name **and** date against `race-info.json`
     before trusting it — this repository has repeatedly grown duplicate event ids that
     way.
   - Sanity-check freshness: a race fetched the day after it is held often returns only
     the PRO field. Compare the athlete count and age-group breadth against the prior
     year before importing.

   **Show me this list and confirm before importing.**

4. **Import each missing edition**, delegating to the existing agents:
   - `race-result-scraper` → fetch the result table → `master/<year>/<id>/result.tsv`
     (half-width space between surname and given name; main age-group categories only —
     and check for a division column *within* a table, not just per-program filtering).
   - `race-info-updater` → add the event/edition to `race-info.json` with correct
     `segments` / `columns` / `meta_columns` mapping, built from the **actual** column
     captions for that edition (they vary year to year).
   - `weather-data-generator` → create `master/<year>/<id>/weather-data.json`
     (see `references/weather-data-policy.md`).
   - New events only: add a unique `.webp` image (≤600×400) per the image policy in the
     `race-data-import` skill — never reuse a placeholder.

5. **Validate** (per the `race-data-import` pipeline):
   ```bash
   bunx ajv-cli validate -s race-info-schema.json -d race-info.json
   bunx ajv-cli validate -s weather-schema.json -d master/<year>/<id>/weather-data.json
   bun scripts/normalize-tsv.js <event_id> <year>
   bun run build:schema
   bun run test        # NOT bare `bun test` — the package script also runs tsc --noEmit
   bun run check:duplicates   # run immediately after every edition-add batch
   bun run check:integrity    # a clean import adds zero missing laps / totals
   ```

6. **Report** what was imported (events, editions, athlete counts) and what was skipped
   (and why). **Do not commit or push** — leave the changes staged for review.

7. **Record what this run learned** by appending a dated section to
   `references/discovery.md`: the new source ceiling, any new column captions and how they
   were mapped, traps hit, and candidates deliberately deferred (with their uuids, so the
   next run does not re-discover them). This file is the memory of the workflow — keeping
   it current in the repository is what makes the import reproducible on any host.
