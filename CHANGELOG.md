# Changelog

All notable changes to this repository are documented here. Versions follow the `version` field in `package.json`; commits between version bumps are grouped under the version that introduced them.

## 5.0.1 — 2026-04-20

- Fix OCR error in Yokohama 2025 age category codes: replaced 1314 occurrences of `N##-##` with `M##-##` across `master/2025/yokohama/default.tsv` (1102) and `master/2025/yokohama/sprint.tsv` (212). All affected entries were male (男), confirming `N` was an OCR misread of `M`.
- Add 2026 Miyakojima Triathlon results (1164 finishers).
- Deduplicate IRONMAN 70.3 Japan and Centrair Chita Peninsula overlapping editions; add a duplicate-edition detector (`scripts/check-duplicate-editions.js`) and `check-duplicates.yml` workflow.
- Refetch IRONMAN Minami Hokkaido 2025 results with `ContactId` from the official API.
- Remove swim segment from 51 races where the swim was cancelled (T1 also empty), including IRONMAN 70.3 Dallas 2026 and IRONMAN 70.3 Colombo 2026.
- Restore `result-schema.json` for the new output format and add validation to `scripts/normalize-tsv.js`.
- Remove `dist/data.json` generation (`build-data.js`, associated workflow).
- Refactor `normalize-tsv` to accept `<event_id> <year>` instead of a TSV path; extract `normalize-category` module.
- Modernize weather data structure and schema; add machine-readable `weatherCode` and `windDirectionCode`.
- Normalize `Ironman` to `IRONMAN` across all metadata and improve image quality.

## 5.0.0 — 2026-04-13

- **Breaking:** Remove `_YYYY` suffix from 111 IRONMAN / IRONMAN 70.3 event IDs so a single event spans all its editions.
- Batch import of IRONMAN and IRONMAN 70.3 results (2002–2025) from CoachCox with athlete `ContactId`:
  - 488 IRONMAN 70.3 race results across 2004–2025.
  - 32 IRONMAN races re-imported from the official API with `ContactId`.
  - Year-by-year backfill for IRONMAN 2002 through 2024.
  - All 111 IRONMAN 2025 races worldwide, plus IRONMAN Taiwan (Penghu) 2026 and IRONMAN Japan South Hokkaido 2025.
- Add Ishigakijima Triathlon 2026 results and weather data.
- Remove 99999 placeholder ranks; recalculate `Overall_Rank` for 92 races with missing rank data.
- Resolve 314 header mismatches and add pre-commit validation.

## 3.0.1 — 2025-xx-xx

- Bump `oven-sh/setup-bun` to v2.
- Update `actions/setup-node` to v6 and `actions/checkout` to v6 / v4.2.2.
- Stop CI from auto-committing `dist/data.json`.

## 3.0.0 — 2025-xx-xx

- Add schema validation test for `race-info.json` against `race-info-schema.json`.
- Make `weather_file` optional in `race-info-schema.json`.
- Remove missing `weather_file` references and fix full-width spaces in TSVs.
- Add missing TSV data for basho 2014–2019 and suzu 2014.
- Move `result-schema.json` from `dist/` to repo root.
- Stop tracking `dist/data.json` locally; let CI generate it.
- Correct column mapping for murakami 2025 and yokohama_hakkeijima 2025.
- Add race editions for choshi, minato_sakata, kamigoto, nagai and fix weather_file gaps.
- Add `race-data-import` skill with image and TSV checklist.
- Add 24 missing race images and fix nagasaki_saikai TSV data.

## Pre-3.0.0 highlights

Major feature work before the 3.0.0 tag, in reverse chronological order.

### Data expansion
- Add 100+ race-years of non-JTU triathlon results.
- Add 2020 / 2021 / 2019 JTU race results (大阪城, 長良川国際, 日本トライアスロン選手権 お台場, etc.).
- Add 2025 滋賀国体, 2009 小松鉄人, 2019 日本エイジSD/SP選手権 (宮崎), おきなわKINトライアスロン, 第4回長良川ミドル102秋.
- Add 25 missing JTU 2022 / 35 missing JTU 2023 / 37 missing JTU 2024 / 8 missing JTU 2025 events; add しろさとTT200 2026.
- Add 木更津トライアスロン 2015–2019 and 2022–2024.
- Add 小松鉄人レース 2014, 2018, 2019, 2022–2025 (multiple categories).
- Add weather data for 小松鉄人 (7 years) and race image (Komatsu Dome).
- Backfill 宮古島 2016–2019 bike/run laps from the official format; restore checkpoint data.
- Add kaike, teganuma, namekawa, takamatsu, biwako, suwako, kisarazu, banpaku, fukuoka, gamagori, uminomori, baramon, fukuyama, nagaragawa races.
- Add IRONMAN 北海道 (2024, 2025), World Championship 2025, Kona.
- Add 2025 editions: sado, gamagori fall, kawaguchiko, nagaragawa, kawasakiko, hakkeijima, chiba city, murakami, numazu, tokunoshima, irago, imabari.

### Data quality / corrections
- Correct 距離区分 (distance classification) errors; remove relay categories.
- Fix DNF/DNS statuses across all 宮古島 editions.
- Normalize TSV names: replace 51 files of full-width spaces with half-width; add lint test that blocks full-width spaces in TSV.
- Fix miyazaki_age sprint championship distance (SS → SD) for 2024/2025.
- Fix 小松鉄人 2019 OCR errors across three categories via high-resolution PDF re-OCR and manual review.
- Normalize 58 TSV header typos and variations.
- Convert miyakojima TSV from absolute time to lap time format.
- Fix 大阪大会 TSV filename casing 2022–2024.

### Architecture / schema
- Migrate from fixed `distance_km` fields to a flexible `segments[]` array (triathlon, duathlon, aquathlon, marathon, swim-cancelled).
- Add `columns` mapping to `segments` for TSV-to-normalized-field annotation; add semantic roles for all TSV columns.
- Add TypeScript type definitions (`schema.ts`) and make `columns` required.
- Add `trail_running` to sport enum.
- Add `weather_file` handling with weather JSON schema.
- Add JSON schemas: `race-info-schema.json`, `weather-schema.json`, early `result-schema` drafts.
- Consolidate multi-category races into single directories.
- Expand residence mapping with 35 additional country / territory codes.
- Improve `age_category` parser to handle 30+ format variations.

### Tooling
- Add build pipeline to convert TSV to normalized JSON.
- Add Biome linter/formatter with Husky pre-commit hook; apply Biome formatting to all JSON and scripts.
- Add unit tests for all normalizer modules.
- Add CI workflows: `json-check`, `validate-race-info`, `validate-weather-data`, `build-data`, and (later retired) release drafter.
- Switch from pnpm/npm to bun.
- Use compact JSON for `data.json` (60 MB → 20 MB).
- Add subagents for weather-data and race-info retrieval.

### Documentation
- Rewrite README with repository purpose and architecture.
- Document distance classification (LD ≥150 km, MD 60–150 km, OD ≈51.5 km, SD ≈25.75 km, SS <SD, DUATHLON, AQUATHLON, OTHER).
- Document build pipeline and normalized data format.
- Update license to Creative Commons BY-ND 4.0.
- Add JSON validity tests and contribution instructions.
