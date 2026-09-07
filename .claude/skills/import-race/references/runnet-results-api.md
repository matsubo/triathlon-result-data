# Runnet Results Api

> RunNet (runnet.jp) official results are served by a deterministic JSON API on result.one.runnet.jp; ranks are per-category and by gross time

RunNet race result pages (`https://runnet.jp/record/race.do?raceId=<ID>`) embed a Next.js result viewer at `https://result.one.runnet.jp/races/<ID>`. The data comes from a clean JSON API — scrape this, not the HTML:

```
GET https://result.one.runnet.jp/api/races/<raceId>/general-categories/<catId>?page=<N>&num=<≤200>&isFixed=true&location=<L>&order=GENERAL
```

- `catId`: category/種目 id. Discover the set by opening the リーダーボード tab's 種目 dropdown and watching the network. IDs are sparse (e.g. fujihill 2026 = 1,3,5,6). These are the **broad organizer categories** (主催者選抜男子/女子, 一般男子/女子) — RunNet results have **no age-group division**; any age groups in our TSVs are enriched separately from the official entry list.
- `location`: checkpoint. `1`=Start, `2`/`3`=intermediate splits, `4`=Finish (default). Each location re-ranks the leaderboard by that split, so **join athletes across locations by `bibNo`** to assemble per-athlete splits. Response includes `netTime`/`grossTime` (cumulative to that location), `categoryRank`, `generalRank`.
- `num` page size caps between 200 and 500 (use ≤100–200 + paginate). Response: `{countGeneral, athletes:[{bibNo, name(半角space), netTime, grossTime, categoryRank, generalRank, ...}]}`.

Critical gotchas:
- `generalRank` is **per general-category, ranked by GROSS time** — NOT a true overall rank and NOT net. For our DB we use net time (`Total_Time`=netTime), so recompute Overall_Rank/age-rank by net (ties → bib asc). See [jtu-results-api](jtu-results-api.md) for the JTU equivalent.
- Some finishers have a `grossTime` but empty `netTime` (missed start mat) — rank them last.
- Bibs present in our provisional (速報) TSV but **absent from the official API** are DNS/DSQ/removed → drop them on the official overwrite (fujihill 2026 had bib 1536 with corrupt negative splits).

Reusable scrapers committed: `scripts/scrape-runnet-fujihill-2026.mjs` (fetch+join), `scripts/rebuild-fujihill-2026-official.mjs` (rebuild TSV keeping enriched Division, net-based ranks).
