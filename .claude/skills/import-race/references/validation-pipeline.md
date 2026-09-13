# Validation Pipeline

> The mandatory post-import audit and build/validate commands — aggregate stats only, never sample rows

## Post-import aggregate audit (MANDATORY before commit)

**Never judge an import by eyeballing a few rows.** Single-sample inspection missed a
column-boundary bug that silently dropped lap data for 348/567 athletes. Run the aggregate
checks and require zeros:

```bash
# Structural lint (time-format, rank-numeric, extra-columns, name-space rules)
bun run test:tsv-lint

# Normalize-level integrity: fails on ANY regression vs integrity-baseline.json;
# a clean new import must add zero missing laps / totals
bun run check:integrity

# End-to-end normalize incl. result-schema validation for the new edition
bun scripts/normalize-tsv.js EVENT_ID YEAR > /dev/null && echo OK
```

Quick manual profile of the new edition (status distribution + nulls):

```bash
bun scripts/normalize-tsv.js EVENT_ID YEAR | python3 -c "
import json,sys
d=json.load(sys.stdin)
for c in d['categories']:
    fin=[a for a in c['athletes'] if a['status']=='finished']
    st={}
    for a in c['athletes']: st[a['status']]=st.get(a['status'],0)+1
    miss=sum(1 for a in fin for s in a['segments'] if s.get('lap_seconds') is None)
    print(c['id'], st, '| finished missing laps:', miss,
          '| no total:', sum(1 for a in fin if a['total_time_seconds'] is None))
"
```

If a metric is legitimately nonzero (the SOURCE truly lacks the data), say so explicitly in
the commit message and re-run `bun run scripts/check-integrity.js --update` so the baseline
records it as known — never leave an unexplained regression. See
[data-quality-gates](data-quality-gates.md).

## Build & validate

Run the full pipeline after any data change:

```bash
# 1. Validate race-info.json schema
bunx ajv-cli validate -s race-info-schema.json -d race-info.json

# 2. Validate any new weather files
bunx ajv-cli validate -s weather-schema.json -d master/YEAR/ID/weather-data.json

# 3. Regenerate the derived TS schema
bun run build:schema

# 4. Full test suite (tsv-lint + normalizers + images + tsc --noEmit)
bun run test        # NOT bare `bun test` — the package script also runs test:typecheck

# 5. Duplicate-edition check — run immediately after every edition-add batch
bun run check:duplicates

# 6. Integrity check (see the audit section above)
bun run check:integrity
```
