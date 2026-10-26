# Ironman Results Api

> Fetching IRONMAN / IRONMAN 70.3 results from labs-v2.competitor.com — curl+UA (WebFetch 403s), subevent discovery, an import plan for `bun scripts/import.js`, placeholder ranks

`WebFetch` gets **403** on ironman.com and labs-v2.competitor.com; plain `curl` with a
browser User-Agent works.

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
# Subevent UUIDs: event page __NEXT_DATA__ -> props.pageProps.subevents[]
curl -s -A "$UA" "https://labs-v2.competitor.com/results/event/<event_uuid>"
# Results rows (what the IRONMAN adapter fetches):
curl -s -A "$UA" "https://labs-v2.competitor.com/api/results?wtc_eventid=<subevent_uuid>"
```

Event uuids come from `scripts/ironman-site-event-uuids.json` (slug → event uuid, built
from the ironman.com sitemap). Keep subevents whose `wtc_eventdate` falls in the target
window and is on or before today.

## Import pipeline

Write an import plan (a throwaway JSON file outside the repository, schema
`scripts/lib/import-plan-schema.json`) and run it through the Import module. Never write
an add-*/import-* script.

```json
{
  "editions": [
    { "event": "im703_porec", "date": "2026-10-18", "ironman": "ace7b6b3-6719-4888-9997-bea0cc93e123" },
    {
      "event": "im703_waco",
      "date": "2026-10-04",
      "ironman": {
        "id": "190ed93a-7bd5-420b-ae54-46e9c970e9b1",
        "description": "2026 IRONMAN 70.3 Waco. Swim was cancelled due to conditions; race held as bike+run only.",
        "segments": [{ "sport": "bike", "distance": 90 }, { "sport": "run", "distance": 21.1 }]
      }
    }
  ]
}
```

```bash
bun scripts/import.js /tmp/plan.json --dry-run   # fetch + every check, writes stay in memory
bun scripts/import.js /tmp/plan.json             # writes the TSVs, then race-info.json
```

The report is JSON on stdout. Exit 0 = every Edition imported or already imported,
2 = some Editions skipped (read each `reason`), 1 = the plan is invalid.

What the IRONMAN adapter and the core decide for you:

- **Template**: `full` (Full Distance, LD, 3.8 / 180.2 / 42.195 km) or `70.3` (Half
  Distance, MD, 1.9 / 90 / 21.1 km). It is inferred from the Event's existing Distance
  classes; set `ironman.template` for a new Event or an Event that has both (e.g.
  `ironman_vietnam`). The latest Edition is never cloned, so a swim-cancelled template
  year can't leak into the new Edition.
- **Paths and ids**: `master/<year>/<event>_<year>/default.tsv`, Category id
  `<event>_<year>`, `weather_file` `<dir>/weather-data.json` (set `"weather": false` only
  if the Event's Editions carry none), `source_ref` `{results_source: "ironman", id}`.
- **Description**: defaults to `<Event name> <year>. <location>.`; override with
  `ironman.description`.
- **Segment distances**: give `ironman.segments` when the course differs from the
  template. A cancelled swim is expressed only by omitting swim from `segments`; the
  Import refuses it if any row carries a Swim split, and refuses a declared Segment whose
  lap column is empty for every finisher.
- **Refused automatically**: PRO-only results (PRO rows ≈ all rows), a TSV byte-identical
  to another TSV, an existing (event, date) with different Source references. A drop of
  more than half the Athletes against the previous Edition is a warning in the report.

New Events go in `events[]` of the plan (`id`, `name`, `location`, `location_parts`,
`image`, `source`, optional `description` / `insert_before`); the image must already
exist and be unique.

### Re-fetching a committed Edition

`{ "event": "...", "date": "...", "mode": "refetch" }` re-reads every Category's
`source_ref`; only TSV bytes may change. It is refused when the header set changed or the
rank probe degrades (fewer unique valid overall ranks, or more rank/total-time ordering
violations; 99999 excluded) — labs-v2 rewrites `Overall_Rank` for days after a race, and
the intermediate state can be worse than what is committed (see the 09-14 note in
[discovery](discovery.md)). Identical bytes report `unchanged`.

## Known data traits (do NOT "clean" these in the TSV)

- `Overall_Rank` / `Div_Rank` = `99999` is a placeholder (DNF / DNS / DQ / PC-ID para).
- `Status` carries DNF / DNS / DQ (empty for finishers).

The normalizer handles both — re-mapping or filtering them away in the TSV is what caused
~586k athletes to be misclassified as finished before the 2026-07 audit (see
[data-quality-gates](data-quality-gates.md)).

## Freshness trap

A race fetched the day after it is held often returns only the PRO field. The Import
refuses a PRO-only table, but also compare athlete count and age-group breadth against the
prior year before importing. See [discovery](discovery.md).
