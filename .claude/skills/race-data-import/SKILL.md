---
name: race-data-import
description: Checklist and procedures for importing new triathlon race data into this repository. Use when adding new events, editions, TSV results, or images.
---

# Race Data Import Checklist

Use this skill whenever adding new races or race editions to the repository.

## Mandatory Checklist (run through every time)

After adding any event/edition to `race-info.json`, verify ALL of the following:

- [ ] `race-info.json` validates: `bunx ajv-cli validate -s race-info-schema.json -d race-info.json`
- [ ] Each new event has an `image` field pointing to an existing `.webp` file
- [ ] TSV columns align correctly with the `segments` / `meta_columns` mapping
- [ ] `bun run build` succeeds without errors

## 1. Image Policy

**Every event MUST have a unique image.** Never leave `image` field pointing to a non-existent file.

### Verify missing images

```bash
node -e "
const path = require('path');
const fs = require('fs');
const base = process.cwd();
const data = JSON.parse(fs.readFileSync('race-info.json'));
const missing = data.events.filter(e => {
  if (!e.image) return false;
  try { fs.accessSync(path.join(base, e.image)); return false; } catch { return true; }
});
if (missing.length === 0) console.log('All images OK');
else missing.forEach(e => console.log('MISSING:', e.id, e.image));
"
```

### Downloading images from Wikimedia Commons

**Use the Wikimedia API** to find image URLs — direct thumbnail URLs return HTTP 429.

```bash
# Step 1: Find image file names via API
curl -s "https://commons.wikimedia.org/w/api.php?action=query&generator=categorymembers&gcmtitle=Category:CATEGORY_NAME&gcmtype=file&prop=imageinfo&iiprop=url|size&format=json&gcmlimit=10" \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
for p in d.get('query',{}).get('pages',{}).values():
  ii=p.get('imageinfo',[{}])
  url=ii[0].get('url','') if ii else ''
  size=ii[0].get('size',0) if ii else 0
  if url and size > 50000 and any(url.lower().endswith(e) for e in ['.jpg','.jpeg','.png']):
    print(url)
"

# Step 2: Download and convert to webp (use magick, NOT ffmpeg — ffmpeg lacks webp encoder)
curl -s -L -H "User-Agent: Mozilla/5.0" "DIRECT_URL" -o /tmp/src.jpg
magick /tmp/src.jpg -resize 300x200\> images/EVENT_ID.webp
```

**Key rules:**
- Use **direct** upload.wikimedia.org URLs (e.g. `/wikipedia/commons/a/ab/File.jpg`), NOT thumbnail paths (`/thumb/...`)
- Use `magick` (ImageMagick 7) for conversion — `ffmpeg` does not support webp output on this system
- Max size: 300×200px (`-resize 300x200\>` preserves aspect ratio)
- Format: webp only

### Searching for images when category is unknown

```bash
# Search by keyword
curl -s "https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=KEYWORD+Japan&srnamespace=6&format=json&srlimit=5" \
  | python3 -c "import json,sys; [print(r['title']) for r in json.load(sys.stdin)['query']['search']]"

# Get direct URL from file title
curl -s "https://commons.wikimedia.org/w/api.php?action=query&titles=File:FILENAME.jpg&prop=imageinfo&iiprop=url&format=json" \
  | python3 -c "import json,sys; p=list(json.load(sys.stdin)['query']['pages'].values())[0]; print(p['imageinfo'][0]['url'])"
```

## 2. TSV Column Alignment

Always verify that imported TSV data has correct column alignment before committing.

### Common pitfall: missing bib (No.) column

Some races have no bib number column. When this happens, the first data column (e.g. surname) gets mistakenly parsed as the bib. Check by inspecting raw TSV:

```bash
head -5 master/YEAR/RACE_ID/result.tsv | cat -A | head -5
```

Signs of misalignment:
- Bib column contains Japanese text (a name fragment)
- Name column contains numbers embedded with the name

### Detecting split names

If a name like `山田 太郎` appears split (e.g. `山田` in bib col, `太郎` in name col), the TSV likely has one fewer column than expected.

Fix: prepend an empty tab to each data row to shift columns right.

```python
import re

with open('result.tsv') as f:
    lines = f.readlines()

header = lines[0]
fixed = [header]
for line in lines[1:]:
    cols = line.rstrip('\n').split('\t')
    # Detect if first col looks like a name fragment (not a number)
    if cols and cols[0] and not re.match(r'^\d+$', cols[0]):
        line = '\t' + line  # prepend empty bib column
    fixed.append(line)

with open('result.tsv', 'w') as f:
    f.writelines(fixed)
```

### Validate column count matches race-info.json

```bash
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('race-info.json'));
// Check a specific edition
const event = data.events.find(e => e.id === 'EVENT_ID');
const edition = event.editions.find(e => e.year === YEAR);
const cat = edition.categories[0];
const allCols = [...(cat.segments||[]).flatMap(s=>s.columns||[]), ...(cat.meta_columns||[]).map(m=>m.column)];
const tsv = fs.readFileSync(cat.result_tsv, 'utf8').split('\n')[0].split('\t');
console.log('Expected cols:', allCols.length, allCols);
console.log('TSV header cols:', tsv.length, tsv);
"
```

## 3. Source-specific fetch procedures

### JTU results (results.jtu.or.jp)

Use the deterministic JSON API — never scrape the SPA (its carousel duplicates rows).
NOTE: quote or `-g` the URL; `[]` in an unquoted URL breaks curl globbing.

```bash
# 1. Event + program list (program_name tells you what to exclude: リレー/パラ/キッズ)
curl -s -g "https://results.jtu.or.jp/api/events/search?cond[event_id]=NNN"

# 2. Result tables for a program
curl -s -g "https://results.jtu.or.jp/api/programs/NNN_1/result_tables"

# 3. Rows (col_1..col_N map 1:1 to result_cols captions, null = empty cell)
curl -s -g "https://results.jtu.or.jp/api/results?cond[result_table_id]=NNNN"
```

Building the TSV from the API response:
- Header = `result_cols[].result_col_caption` with embedded `\n` stripped.
- Some events use full-width spaces in 氏名 — convert to half-width (`名前　太郎` → `名前 太郎`).
- Some columns are constant division tags (種別="エイジ"), not age brackets — map them to role `note`, never to a second `age_category` (a duplicate role mapping silently clobbers the real value).

### IRONMAN (labs-v2.competitor.com)

`WebFetch` gets 403 on ironman.com / labs-v2.competitor.com; plain `curl` with a browser User-Agent works.

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
# Subevent UUIDs: event page __NEXT_DATA__ -> props.pageProps.subevents[]
curl -s -A "$UA" "https://labs-v2.competitor.com/results/event/<event_uuid>"
# Results rows:
curl -s -A "$UA" "https://labs-v2.competitor.com/api/results?wtc_eventid=<subevent_uuid>"
```

Then use the established pipeline: add the edition to race-info.json (clone a same-distance template: `im703_durban` for 70.3, `ironman_philippines` for full), write a subevents JSON, and run `bun run scripts/fetch-ironman-results.js --input <file>`.

Known data traits: `Overall_Rank`/`Div_Rank` = `99999` is a placeholder (DNF/DNS/DQ/PC-ID para); `Status` column carries FIN/DNF/DNS/DQ/NC. The normalizer handles these — do NOT re-map or filter them away in the TSV.

### PDF results (pdfplumber)

Two extraction strategies, in order of preference:

1. `page.extract_table()` — works when the PDF has real table structure.
2. Char-level (`page.chars`) with x-position column bucketing — required when
   text extraction interleaves ruby (furigana) with base characters, or when
   `extract_text()` scrambles column order.

Char-level recipe (learned from the iseshima 2026 import):

- **Filter ruby glyphs by font size**: ruby renders ~5pt, real content 6pt+.
  Check `sorted(set(round(c['size'],1) for c in page.chars))` first.
- **Cluster rows by `top`** with a tolerance (~10pt); name cells with ruby
  span two baselines within one logical row.
- **Column boundaries — the critical part.** Time columns start at a CONSTANT
  x for every row (fixed-width font, left-aligned). Rank/numeric columns are
  RIGHT-ALIGNED in their slot: a 3-digit rank starts further left than a
  1-digit rank. Calibrate each boundary as the midpoint between the constant
  start-x of the following time column and the widest (leftmost) extent a
  rank value can reach — never calibrate against 1-2 digit examples only.
  Get the constant x positions from a frequency count:
  `Counter(round(c['x0'],1) for c in chars)` — positions appearing hundreds
  of times are column starts.
- Some sources publish year-specific column layouts — recalibrate per year.

## 4. Post-import aggregate audit (MANDATORY before commit)

Never judge an import by eyeballing a few rows: single-sample inspection
missed a boundary bug that silently dropped lap data for 348/567 athletes.
Run the aggregate checks and require zeros:

```bash
# Structural lint (time-format, rank-numeric, extra-columns, name-space rules)
bun run test:tsv-lint

# Normalize-level integrity: fails on ANY regression vs integrity-baseline.json;
# a clean new import must add zero missing laps / totals
bun run check:integrity

# End-to-end normalize incl. result-schema validation for the new edition
bun scripts/normalize-tsv.js EVENT_ID YEAR > /dev/null && echo OK
```

For a quick manual profile of the new edition (status distribution + nulls):

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

If a metric is legitimately nonzero (the SOURCE truly lacks the data), say so
explicitly in the commit message and re-run
`bun run scripts/check-integrity.js --update` so the baseline records it as
known — never leave an unexplained regression.

## 5. Build & Validate

Always run the full validation pipeline after any data changes:

```bash
# 1. Validate race-info.json schema
bunx ajv-cli validate -s race-info-schema.json -d race-info.json

# 2. Validate any new weather files
bunx ajv-cli validate -s weather-schema.json -d master/YEAR/ID/weather-data.json

# 3. Full test suite (includes tsv-lint + normalizers + typecheck)
bun run test

# 4. Duplicate-edition check
bun run check:duplicates

# 5. Integrity check (see section 4)
bun run check:integrity
```
