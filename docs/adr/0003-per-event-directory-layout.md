# One directory per Event; every corpus path is derived

Supersedes in part [ADR-0001](0001-source-references-on-categories.md): its choice of file. Source references stay on Categories. They now live in each Edition's `edition.json` instead of the single `race-info.json`.

## Context

All Event, Edition and Category metadata lived in one `race-info.json`: 8,310,858 bytes (7.9 MiB) for 420 Events, 2,697 Editions and 2,998 Categories. Every Import rewrote the whole file, and every edit to one Event produced a diff in a multi-megabyte file.

- Biome skips files over 1 MiB without reporting it, so the most edited JSON file in the repository was never formatted or linted. The Import module carried a `race_info_needs_format` workaround that called Biome explicitly.
- Most of the bytes repeat themselves. The 2,998 Categories use only 332 distinct column mappings (`meta_columns` plus each Segment's `columns`): 89% of Categories repeat a mapping another Category already declares.
- Paths were stored, not derived. Each Category's `result_tsv`, each Edition's `weather_file` and each Event's `image` were free strings, and they drifted:
  - 19 TSV paths did not follow `master/<year>/<event_id>[_<year>]/`: `nagaragawa_102`, `kona_thu/sat_2022`, `arizona_nov_2008`, the St George year mismatch, IRONMAN Vietnam Editions under `im703_vietnam_<Y>`, `ishigaki`.
  - IRONMAN Vietnam 2026-05-10 was split across two directories, one of them holding an unreferenced copy of the weather file.
  - TSV basenames (`default.tsv`, `result.tsv`, `sprint.tsv`) did not match Category ids.
  - Images were named after something other than their Event (`kona.webp`, `nice.webp`), and one was shared by two Events.
- Image credits lived in a separate `docs/image-sources.tsv` keyed by file name. It had drifted: 33 rows pointed at deleted images, and 23 Events had no row.
- Edition order inside an Event was manual (newest-first in some Events, oldest-first in others, mixed in nine). New Events were placed with an `insert_before` plan field.

## Decision

Each Event is a directory. Each Edition is a dated directory inside it. Every path is derived from (Event id, Edition date, Category id):

```
master/<event_id>/event.json                      name, location, location_parts, source, description?, image_source?
master/<event_id>/image.webp
master/<event_id>/<YYYY-MM-DD>/edition.json       { "categories": [...] }
master/<event_id>/<YYYY-MM-DD>/<category_id>.tsv
master/<event_id>/<YYYY-MM-DD>/weather-data.json  present = the Edition has weather
```

- `scripts/lib/layout.js` is the only code that builds or classifies these paths. `scripts/lib/corpus.js` (`readCorpus`) reads the corpus and fills in the derived `id`, `image`, `weather_file` and `result_tsv`. It reports every file that is not one of the five kinds at its place, and every incomplete Event or Edition directory, as a layout finding. Any layout finding fails `check:integrity`.
- Events are ordered by id and Editions by date. There is no stored order.
- `event-schema.json` and `edition-schema.json` replace `race-info-schema.json`. Image credits are each Event's `image_source`.
- The Import module writes only the new Edition directory, plus `event.json` for a new Event. A new Event's image must already be at `master/<id>/image.webp`, and its bytes must not match another Event's image.
- Files are `JSON.stringify(x, null, 2)` plus a newline, which Biome accepts unchanged. Each file is far below Biome's 1 MiB limit, so Biome checks all of them.

## Considered Options

- **Keep `race-info.json` and raise Biome's size limit**: rejected. It fixes formatting only. Stored paths would keep drifting, and every Import would still rewrite the whole corpus.
- **One JSON file per Event (editions inline)**: rejected. Long-running Events would still be large files, and an Import would rewrite every Edition of the Event.
- **Store paths but lint them against a convention**: rejected. It is a second rule to keep in sync with the data, while deriving them makes the drift impossible.
- **Deduplicate column mappings into shared templates**: deferred. It is independent of the layout and can be done on top of `edition.json`.

## Consequences

- Downstream (ai-tri) no longer reads one file. It groups the git tree with `classify()` from `scripts/lib/layout.js` and reads Events through `readCorpus` or `readCategories`. The first sync after this change re-reads every Edition (about 3.1k small JSON files); later syncs can fingerprint an Edition by the blob ids of its directory.
- Placeholder dates (`YYYY-01-01`, 392 Editions) are now directory names. Correcting a date renames the Edition directory, and every derived path changes with it.
- Image paths change. Images keyed by Event id keep their name, except the three that were not: `kona.webp` → `ironman_world_championship_kona`, `nice.webp` → `ironman_world_championship`, and `gamagori_fall`, which used `gamagori.webp` and now has its own copy until it gets a real image.
- Category ids are file names: they must match `^[a-z0-9_]+$` and be unique within an Edition.
- A file dropped into `master/` by hand that is not a corpus file fails CI instead of being ignored.
