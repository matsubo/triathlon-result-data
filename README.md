# Multi-Sport Race Result Data

[![JSON Syntax Check](https://github.com/matsubo/triathlon-result-data/actions/workflows/json-check.yml/badge.svg)](https://github.com/matsubo/triathlon-result-data/actions/workflows/json-check.yml)
[![Validate Race Info](https://github.com/matsubo/triathlon-result-data/actions/workflows/validate-race-info.yml/badge.svg)](https://github.com/matsubo/triathlon-result-data/actions/workflows/validate-race-info.yml)
[![Validate Weather Data](https://github.com/matsubo/triathlon-result-data/actions/workflows/validate-weather-data.yml/badge.svg)](https://github.com/matsubo/triathlon-result-data/actions/workflows/validate-weather-data.yml)
[![Check Duplicate Editions](https://github.com/matsubo/triathlon-result-data/actions/workflows/check-duplicates.yml/badge.svg)](https://github.com/matsubo/triathlon-result-data/actions/workflows/check-duplicates.yml)

## Purpose

Competitive multi-sport events — triathlon, duathlon, aquathlon, marathon, and variants with cancelled swims — share the same universal question: *how did everyone perform?* Analyzing one's own and others' performance is valuable wherever competition exists.

This repository's mission is to **take messy, per-race result TSVs and publish them as normalized JSON**, so downstream applications can treat every race uniformly regardless of the original format.

Normalized data from this repository powers [AI TRI+](https://ai-triathlon-result.teraren.com/).

## Architecture

```
Input (master/)
  *.tsv              (denormalized results) ─┐
  weather-data.json  (race-day weather)     ─┤── normalize-tsv.js ──→ JSON (stdout)
race-info.json       (column mapping / meta) ┘
```

## Data model

```
Event
  └── Edition (one race date)
        ├── Weather
        └── Category (e.g. OD, Sprint, Long)
              ├── Segments  (ordered sports: swim → bike → run, etc.)
              └── Athletes  (per-finisher results)
```

- **Event** — a race brand (e.g. Yokohama Triathlon).
- **Edition** — a specific running of the event (e.g. `2025-05-18`). Holds weather.
- **Category** — a distance/class within an edition (e.g. OD, Sprint, Duathlon).
- **Segments** — an ordered array `[{sport, distance_km}]`. Supports triathlon, duathlon (run-bike-run), aquathlon (swim-run), marathon (run), and swim-cancelled events (bike-run).
- **Athlete** — one finisher's normalized record (rank, status, total time, per-segment splits).

## Generating normalized output

Given an event ID and a year, emit that edition's normalized JSON to stdout:

```bash
bun scripts/normalize-tsv.js <event_id> <year>
```

Examples:

```bash
bun scripts/normalize-tsv.js ironman_cairns 2025
bun scripts/normalize-tsv.js sado 2024
bun scripts/normalize-tsv.js yokohama 2025
```

- `event_id` corresponds to `events[].id` in `race-info.json`.
- Warnings are written to **stderr**; normalized JSON goes to **stdout**.
- Output is validated against `result-schema.json` before being emitted.

### Normalization rules

| Field | Transform |
|-------|-----------|
| Time | `"2:02:41"` → `7361` (seconds) |
| Gender | `"男"` → `"M"`, `"女"` → `"F"` |
| Prefecture | `"神奈川県"` → `"JP-14"` (ISO 3166-2:JP) |
| Country | `"United States"` → `"US"` (ISO 3166-1 alpha-2) |
| Age group | `"M25-29"` → `{"min_age": 25, "max_age": 29}` |
| Rank / status | `"DNF"` → `rank: null, status: "DNF"` |

### Status values

| Value | Meaning |
|-------|---------|
| `finished` | Completed the course. |
| `DNF` | Did Not Finish (withdrew mid-race). |
| `DNS` | Did Not Start. |
| `DSQ` | Disqualified. |
| `TOV` | Time Over the cutoff. |
| `OPEN` | Open-category entry (no ranking). |
| `SKIP` | Skipped the swim segment (bike + run only). |

### Output shape

```json
{
  "event_id": "yokohama",
  "name": "Yokohama Triathlon",
  "location": "Yokohama",
  "date": "2025-05-18",
  "weather": { "...": "..." },
  "categories": [{
    "id": "yokohama",
    "distance": "OD",
    "segments": [
      { "sport": "swim", "distance_km": 1.5 },
      { "sport": "bike", "distance_km": 40 },
      { "sport": "run",  "distance_km": 10 }
    ],
    "athletes": [{
      "rank": 1,
      "status": "finished",
      "name": "橋本 悠輝",
      "gender": "M",
      "residence": "JP-14",
      "total_time_seconds": 7361,
      "segments": [
        { "lap_seconds": 1325, "rank": 11 },
        { "lap_seconds": 3887, "rank": 1,  "transition_seconds": 85 },
        { "lap_seconds": 2064, "rank": 2 }
      ]
    }]
  }]
}
```

## Distance classifications

| Value | Total distance | Description |
|-------|----------------|-------------|
| `LD` | ≥150 km | Long Distance (swim ≥3 km, bike ≥120 km, marathon-length run) |
| `MD` | 60–150 km | Middle Distance (between OD and LD; includes 102 km and ~90 km formats like KIN) |
| `OD` | ~51.5 km | Olympic Distance (swim 1.5 km, bike 40 km, run 10 km) |
| `SD` | ~25.75 km | Sprint Distance (swim 0.75 km, bike 20 km, run 5 km) |
| `SS` | <SD | Super Sprint |
| `DUATHLON` | — | Run-Bike-Run |
| `AQUATHLON` | — | Swim-Run |
| `OTHER` | — | Time trials, relays, and other formats |

## Adding data

### Add an event

Edit `race-info.json`. The structure is a tree of events → editions → categories. Each category declares its `segments` (ordered sports) and maps TSV headers to normalized fields via `columns` and `meta_columns`.

Validate the result:

```bash
bunx ajv-cli validate -s race-info-schema.json -d race-info.json
```

### Add a race image

Store a WebP image symbolic of the venue at `images/<event_id>.webp`, roughly 400×300 px (≤300×200 is also fine). **Placeholder re-use is not allowed** — every event needs its own image.

### Add weather data

Per edition, at `master/<year>/<event_id>/weather-data.json`, following `weather-schema.json`. Include 3-hourly entries (03, 06, 09, 12, 15, 18, 21, 24). Use JMA's past weather records from the nearest AMeDAS station.

Validate:

```bash
bunx ajv-cli validate -s weather-schema.json -d master/<year>/<event_id>/weather-data.json
```

### Add results

Drop TSV files under:

```
master/<year>/<event_id>/<category>.tsv
```

Keep the original column headers — the repository normalizes them through the `columns` / `meta_columns` mapping in `race-info.json`, so you do not need to rename anything by hand.

**TSV conventions:**
- Separate family name and given name with a **half-width space** (`山田 太郎`, not `山田　太郎`).
- Use `DNF` / `DNS` / `DSQ` / `TOV` / `OPEN` / `SKIP` for non-finisher rows.

Contributions are welcome via Issue or Pull Request.

### Proper nouns

- **IRONMAN** is a proper noun and is always written in all capitals (`IRONMAN`, `IRONMAN 70.3`, `IRONMAN World Championship`). Do not write it as `Ironman`.

## Development setup

```bash
bun install
```

`bun install` sets up the Husky pre-commit hook automatically.

### Lint and format

[Biome](https://biomejs.dev/) handles lint + format for JSON and JS files.

```bash
bun run check    # lint + format, auto-fix
bun run format   # format only
bun run lint     # lint only
```

The pre-commit hook runs Biome on staged files; lint errors block the commit.

### Tests

```bash
bun run test             # runs all checks below
bun run test:json        # JSON syntax validity
bun run test:schema      # race-info.json ↔ race-info-schema.json
bun run test:weather     # validate every weather-data.json
bun run test:normalizers # unit tests for normalizer modules
bun run test:tsv-lint    # TSV conventions (e.g. no full-width spaces)
bun run check:duplicates # detect duplicate race editions
```

The GitHub Actions workflows run the same checks:

- **json-check** — JSON syntax validity.
- **validate-race-info** — `race-info.json` against its schema.
- **validate-weather-data** — every `weather-data.json` against `weather-schema.json`.
- **check-duplicates** — flag pairs of editions whose `(name, total_time)` fingerprints overlap ≥80 % (allowlist genuinely distinct lookalikes in `duplicate-allowlist.json`).

## Importing new race data

### From the JTU results system

JTU result pages load dynamically, so Playwright is required. URL patterns:

- Program list: `https://www.jtu.or.jp/result_program/?event_id={ID}`
- Individual result: `https://www.jtu.or.jp/result/?event_id={ID}&program_id={ID}_{N}`

Rough year ranges for `event_id`:

| Year | Range |
|------|-------|
| 2022 | 124–169 |
| 2023 | 172–232 |
| 2024 | 239–310 |
| 2025 | 309–374 |

Scrape `table.result_table` from each program page and write TSV to `master/<year>/<event_id>/`. Filter out non-main-age-group categories (kids, junior, relay, para, elementary, middle-school, aquathlon, duathlon, beginner, challenge).

### From PDFs

Non-JTU races (Kisarazu, Miyazaki Seagaia, etc.) often publish PDF results. Extract with `pdfplumber`:

```python
import pdfplumber
with pdfplumber.open("result.pdf") as pdf:
    for page in pdf.pages:
        table = page.extract_table()
```

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the full history.

## License

All data and scripts in this repository are released under [Creative Commons Attribution-NoDerivatives 4.0 International (CC BY-ND 4.0)](https://creativecommons.org/licenses/by-nd/4.0/). Please credit the source when using it. Distribution of modified data or code is not permitted.
