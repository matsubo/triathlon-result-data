---
name: import-race
description: Use when importing triathlon race data into this repository — sweeping IRONMAN/JTU for editions not yet imported, filling the gap since the last import run, or hand-adding a single event, edition, result TSV, weather file, or event image. Runs end to end without asking — imports, validates, commits and pushes to origin/main. Accepts an optional scope argument, "ironman" or "jtu" to restrict the source and/or a 4-digit year to restrict the year.
---

# Import race data

Everything that turns a dirty external result source into a committed, validated, pushed
edition in this repository. Two ways in:

- **Sweep mode** — "import missing editions", "check for new results", or an invocation
  with a scope argument. Start at step 1.
- **Single-edition mode** — a specific event / edition / TSV / image was named. Run step 1's
  sync, skip to step 4, then always finish with steps 5-8.

**Scope** — from the invocation arguments, if any: `$ARGUMENTS`
- No arguments → check **both** IRONMAN and JTU, for the current and previous year.
- `ironman` / `jtu` → restrict to that one source.
- A 4-digit year → restrict to that year.

## Autonomy

Run the whole procedure — discover, import, validate, commit, push — **without asking the
user for confirmation**. A routine addition needs no approval: a new edition of an existing
event, or a new event of a kind the repository already carries (age-group triathlon, 国スポ,
日本選手権), that passes every gate in step 5.

Stop and ask only for decisions the repository cannot answer. Import every routine candidate
first, then ask about these (or list them in the report):
- A candidate that `references/discovery.md` records as **excluded or deferred by user
  choice** (e.g. JTU 441 日本スーパースプリント選手権).
- A kind of event the repository has no precedent for, including standalone aquathlon /
  duathlon events (see their policy files).
- Rewriting already-committed data: re-fetching a committed edition, merging duplicate
  event ids, regenerating committed weather files.

In an unattended run, such as the daily Orca automation "triathlon race discovery", never
ask. Leave those candidates out, list them in the report, and record them as pending in
`references/discovery.md`.

Do not ask about a candidate that fails a quality check — for example PRO-only partial
results, or JMA weather not yet published. Skip it, record it as deferred in
`references/discovery.md` with its uuid / table ids and the reason, and pick it up next run.

## Mandatory checklist (every import, both modes)

- [ ] `race-info.json` validates against `race-info-schema.json`
- [ ] Each new event has an `image` field pointing to an existing, **unique** `.webp`
- [ ] TSV columns align with the edition's `segments` / `meta_columns` mapping
- [ ] The aggregate audit is clean — `test:tsv-lint`, `check:integrity`, `check:duplicates`
- [ ] `bun run build:schema` and `bun run test` succeed

## Required reading first

1. **`references/discovery.md`** — the accumulated discovery playbook: how to enumerate
   candidates deterministically from each source, the traps that have actually bitten past
   runs (duplicate event ids, PRO-only partial results, swim cancellations, returning
   races), and a dated log of per-run learnings. *(Sweep mode; skim it in single-edition
   mode too — the traps apply either way.)*
2. `CLAUDE.md` → "新規大会データの取り込み手順" for the repository's data conventions and
   which categories to filter out (キッズ / ジュニア / リレー / パラ / アクアスロン /
   デュアスロン etc.).

Other references, consult as the source and task demand:

| File | Use for |
|---|---|
| `references/jtu-results-api.md` | JTU JSON result API shapes, and building the TSV from them |
| `references/ironman-results-api.md` | IRONMAN / 70.3 via labs-v2.competitor.com |
| `references/runnet-results-api.md` | RunNet-hosted domestic races |
| `references/mikatiming-csv-import.md` | Challenge Roth and other mikatiming CSV results |
| `references/pdf-extraction.md` | PDF results — pdfplumber table and char-level recipes |
| `references/teganuma-pdf-import.md` | 手賀沼 page map and per-year PDF quirks |
| `references/image-policy.md` | Sourcing, converting and verifying event images |
| `references/tsv-column-alignment.md` | Column-shift detection and the missing-bib fix |
| `references/name-space-fix-methodology.md` | Restoring the 姓 / 名 half-width space |
| `references/weather-data-policy.md` | Which editions need weather, and from which source |
| `references/aquathlon-import-policy.md`, `references/duathlon-import-policy.md` | Whether a non-triathlon event is in scope |
| `references/validation-pipeline.md` | The aggregate audit and full build/validate commands |
| `references/data-quality-gates.md` | The gates an import must pass before commit |

**Host prerequisites:** `bun`, `node`, `python3` (with `pdfplumber` for PDF sources),
`magick` (ImageMagick 7, for images), `curl`. No host-local state is required — everything
this workflow needs is in the repository.

## Procedure

1. **Sync, then inventory.** Run `git fetch` and `git pull --ff-only` first, because another
   session may already have imported the same races (see the 2026-10-09 note in
   `references/discovery.md`). Then read `race-info.json` and build the set of
   `(event, date)` editions already imported. Editions key off `edition.date`, not a
   `year` field. Do not re-import these. Leftover uncommitted import files mean an earlier
   run was interrupted: finish and include them. Leave unrelated untracked or modified
   files alone.

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

   Proceed straight to step 4 with every routine candidate; see **Autonomy** above for the
   few cases that still need the user.

4. **Import each edition**, delegating to the existing agents:
   - `race-result-scraper` → fetch the result table → `master/<year>/<id>/result.tsv`
     (half-width space between surname and given name; main age-group categories only —
     and check for a division column *within* a table, not just per-program filtering).
     Verify column alignment per `references/tsv-column-alignment.md`.
   - `race-info-updater` → add the event/edition to `race-info.json` with correct
     `segments` / `columns` / `meta_columns` mapping, built from the **actual** column
     captions for that edition (they vary year to year).
   - `weather-data-generator` → create `master/<year>/<id>/weather-data.json`
     (see `references/weather-data-policy.md`).
   - New events only: add a unique `.webp` image (≤600×400) per
     `references/image-policy.md` — never reuse a placeholder.

5. **Validate and audit** — full commands and the aggregate-audit rationale in
   `references/validation-pipeline.md`:
   ```bash
   bun run test:schema       # race-info.json ↔ race-info-schema.json
   bun run test:weather      # every weather-data.json ↔ weather-schema.json
   bun scripts/normalize-tsv.js <event_id> <year>
   bun run build:schema
   bun run test              # NOT bare `bun test` — the package script also runs tsc --noEmit
   bun run check:duplicates  # run immediately after every edition-add batch
   bun run check:integrity   # a clean import adds zero missing laps / totals
   ```
   Never accept an import on the strength of a few eyeballed rows — the audit is
   aggregate statistics, and a nonzero metric must either be fixed or explained in the
   commit message and recorded with `bun run scripts/check-integrity.js --update`.
   If an edition cannot be made to pass, remove its files and its `race-info.json` entry,
   record it as deferred, and commit the rest.

6. **Record what this run learned** by appending a dated section to
   `references/discovery.md`: the new source ceiling, any new column captions and how they
   were mapped, traps hit, and candidates deliberately deferred (with their uuids, so the
   next run does not re-discover them). This file is the memory of the workflow — keeping
   it current in the repository is what makes the import reproducible on any host.
   A sweep that found nothing and learned nothing needs no entry. This matters for the daily
   unattended run: an empty entry every day would bury the real ones.

7. **Commit and push to `origin/main`.**
   - Stage only the paths this run created or changed: `git add <paths>`, never
     `git add -A`.
   - Commit the data as `feat: import <races> <date> (<N>)`, following `git log`. The body
     carries the per-edition athlete counts and any baselined integrity gaps. Commit the
     `discovery.md` section separately as `docs(import-race): record the <date> sweep`.
   - Run `git push origin HEAD:main`. If it is rejected, run `git fetch origin` and
     `git rebase origin/main`. Drop any edition that upstream already imported, re-run
     `bun run test`, `check:duplicates` and `check:integrity`, then push again. Never
     force-push or bypass hooks (`--no-verify`).

8. **Report** the pushed commit hashes, what was imported (events, editions, athlete
   counts), what was skipped or deferred and why, and any decisions left for the user.

