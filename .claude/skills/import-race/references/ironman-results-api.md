# Ironman Results Api

> Fetching IRONMAN / IRONMAN 70.3 results from labs-v2.competitor.com — curl+UA (WebFetch 403s), subevent discovery, placeholder ranks

`WebFetch` gets **403** on ironman.com and labs-v2.competitor.com; plain `curl` with a
browser User-Agent works.

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
# Subevent UUIDs: event page __NEXT_DATA__ -> props.pageProps.subevents[]
curl -s -A "$UA" "https://labs-v2.competitor.com/results/event/<event_uuid>"
# Results rows:
curl -s -A "$UA" "https://labs-v2.competitor.com/api/results?wtc_eventid=<subevent_uuid>"
```

Event uuids come from `scripts/ironman-site-event-uuids.json` (slug → event uuid, built
from the ironman.com sitemap). Keep subevents whose `wtc_eventdate` falls in the target
window and is on or before today.

## Import pipeline

Add the edition to `race-info.json` by cloning a same-distance template —
`im703_durban` for 70.3, `ironman_philippines` for full — then write a subevents JSON and
run:

```bash
bun run scripts/fetch-ironman-results.js --input <file>
```

## Known data traits (do NOT "clean" these in the TSV)

- `Overall_Rank` / `Div_Rank` = `99999` is a placeholder (DNF / DNS / DQ / PC-ID para).
- `Status` carries FIN / DNF / DNS / DQ / NC.

The normalizer handles both — re-mapping or filtering them away in the TSV is what caused
~586k athletes to be misclassified as finished before the 2026-07 audit (see
[data-quality-gates](data-quality-gates.md)).

## Freshness trap

A race fetched the day after it is held often returns only the PRO field. Compare athlete
count and age-group breadth against the prior year before importing. See
[discovery](discovery.md).
