# Jtu Results Api

> JTU has a deterministic JSON results API — use it instead of scraping the carousel-prone SPA; import programs with a plan through `bun scripts/import.js`

The JTU result pages (`https://www.jtu.or.jp/result/...`) are a JavaScript SPA with an **auto-rotating carousel that redirects to other events**, causing stale-DOM **cross-contamination** when scraped via Playwright (one event's table gets saved as another's). This has already corrupted committed data (e.g. `uminomori 2023` held 京都丹波 data; `fukuoka 2023` held 海の森 sprint data — both fixed 2026-05).

Use the **backing JSON API** instead — it is deterministic (keyed by result_table_id), immune to the carousel:
- Event + programs: `https://results.jtu.or.jp/api/events/search?cond[event_id]=NNN` → `res.body.events[0]` (event_name, event_date, event_location) + `res.body.programs[NNN][]` (program_id, program_name)
- Result tables for a program: `https://results.jtu.or.jp/api/programs/{program_id}/result_tables` → `res.body[].result_table_id`
- Rows: `https://results.jtu.or.jp/api/results?cond[result_table_id]=N` → `res.body.result_cols[]` (result_col_order, result_col_caption — may contain `\n`) + `res.body.result_list[]` (each row has `col_1`..`col_N`; null = empty)

URL-encode the brackets (`cond%5Bevent_id%5D`), or quote / `-g` the URL in curl.

```bash
# Discovery: event + program list (program_name tells you what to exclude: リレー/パラ/キッズ)
curl -s -g "https://results.jtu.or.jp/api/events/search?cond[event_id]=NNN"
# Inspect a program's captions before writing the plan
curl -s -g "https://results.jtu.or.jp/api/programs/NNN_1/result_tables"
curl -s -g "https://results.jtu.or.jp/api/results?cond[result_table_id]=NNNN"
```

## Import pipeline

Write an import plan (a throwaway JSON file outside the repository, schema
`scripts/lib/import-plan-schema.json`) with one `jtu[]` entry per program to import, and
run it through the Import module. Never write an add-*/import-* script.

```json
{
  "editions": [
    {
      "event": "kasumigaura",
      "date": "2026-10-11",
      "jtu": [
        {
          "program": "437_1", "distance": "MD",
          "description": "2026年第6回霞ヶ浦国際トライアスロンフェスタ ミドルの部（K100）。…",
          "segments": [{ "sport": "swim", "distance": 2 }, { "sport": "bike", "distance": 78 }, { "sport": "run", "distance": 20 }]
        },
        { "program": "437_3", "distance": "OD", "description": "…スタンダードの部。…" }
      ]
    }
  ]
}
```

```bash
bun scripts/import.js /tmp/plan.json --dry-run   # fetch + every check, writes stay in memory
bun scripts/import.js /tmp/plan.json             # writes the TSVs, then race-info.json
bun run scripts/fix-age-category-labels.js       # canonical M/F 年齢区分 labels (the API returns 男子25-29歳)
```

What the JTU adapter and the core do:

- **One program = one Category**, and the program must have exactly one result table.
- **Header** = captions in `result_col_order`, `\n` stripped, kept verbatim (ｽｲﾑﾗｯﾌﾟ, Ｓ順, 年齡別順).
  Zero-padded hours (`00:55:32`) become `0:55:32`.
- **Column roles** come from one caption vocabulary in `scripts/lib/results-sources/jtu.js`,
  matched after NFKC folding. A constant division tag column (種別="エイジ") maps to `note`,
  never a second `age_category`; 選手権順 maps to `championship_rank`. **An unknown caption
  stops the Import**: rename or drop it in the plan, or add it to the vocabulary.
- **Column options** (`jtu[].columns`): `rename` (caption → TSV header, e.g. bare
  スイム/バイク/ラン → スイムラップ/バイクラップ/ランラップ so tsv-lint's time rule covers
  them, or English elite captions Pos/StartNum/Name/… → 総合順位/No./氏名/…), `drop`
  (`""` is the null-caption slug column of elite tables), and `constants`
  (`[{"header": "性別", "value": "男", "after": "氏名"}]` for per-gender tables without a
  gender column).
- **氏名 cleanup**: U+3000 and doubled spaces → one half-width space, full-width Latin /
  digits → half-width.
- **Paths and ids**: `master/<year>/<event>/<file>`, `weather_file`
  `master/<year>/<event>/weather-data.json`, `source_ref` `{results_source: "jtu", id: <program>}`,
  `source_url` = the results API URL of the table. `id`, `file` and `name` default from the
  previous Edition's only Category with the same Distance class; give them in the plan
  otherwise (and for a new Event).
- **Segments** come from the captions (swim / bike / run in that order) with the standard
  km for the Distance class (OD 1.5/40/10, SD 0.75/20/5, MD 1.9/90/21.1, LD 3.8/180.2/42.195).
  Give `segments` whenever the course differs — read the distances from the organiser, never
  clone the sibling's. A cancelled leg is expressed only by omitting it from `segments`.
- **Refused automatically**: a TSV byte-identical to another TSV (the carousel
  contamination signature), a declared Segment whose lap column is empty for every finisher,
  a duplicated single-use role, an existing (event, date) with different programs.

To re-fetch a committed Edition, use `"mode": "refetch"` with the same `jtu[].columns`
options the import used (only `program` + `columns`). The refetched TSV carries the API's
raw 年齢区分 labels; run `fix-age-category-labels.js` afterwards to get the committed bytes
back.

Filter out non-age-group programs per AGENTS.md (キッズ / ジュニア / リレー / パラ /
小学 / 中学 / アクアスロン / デュアスロン / ビギナー / チャレンジ) — and check for a
division column *within* a table, not just per-program filtering.
