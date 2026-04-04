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

## 3. Build & Validate

Always run the full validation pipeline after any data changes:

```bash
# 1. Validate race-info.json schema
bunx ajv-cli validate -s race-info-schema.json -d race-info.json

# 2. Validate any new weather files
bunx ajv-cli validate -s weather-schema.json -d master/YEAR/ID/weather-data.json

# 3. Build dist/data.json
bun run build

# 4. Confirm athlete count increased reasonably
node -e "const d=JSON.parse(require('fs').readFileSync('dist/data.json')); console.log('Categories:', d.categories?.length, 'Athletes:', d.results?.length ?? Object.values(d).filter(Array.isArray).flat().length)"
```
