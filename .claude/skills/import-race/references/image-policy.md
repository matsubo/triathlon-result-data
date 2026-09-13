# Image Policy

> Every event needs its own `.webp` — how to find, fetch and convert one, and how to verify none are missing

**Every event MUST have a unique image.** Never leave the `image` field pointing at a
non-existent file, and never reuse a placeholder across events.

## Verify no event is missing its image

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

`bun run test:images` covers this in the suite.

## Downloading from Wikimedia Commons

**Use the Wikimedia API** to resolve image URLs — direct thumbnail URLs return HTTP 429.

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

# Step 2: Download and convert to webp (use magick, NOT ffmpeg — ffmpeg lacks a webp encoder)
curl -s -L -H "User-Agent: Mozilla/5.0" "DIRECT_URL" -o /tmp/src.jpg
magick /tmp/src.jpg -resize 600x400^ -gravity center -extent 600x400 -quality 82 images/EVENT_ID.webp
```

**Key rules:**
- Use **direct** upload.wikimedia.org URLs (e.g. `/wikipedia/commons/a/ab/File.jpg`), NOT
  thumbnail paths (`/thumb/...`)
- Use `magick` (ImageMagick 7) — `ffmpeg` does not support webp output on this system
- Size: 600×400px — what every image in `images/` actually is, and the limit CLAUDE.md
  states. `-resize 600x400^ -gravity center -extent 600x400` fills and centre-crops to
  exactly that.
- Format: webp only

## Searching when the category is unknown

```bash
# Search by keyword
curl -s "https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=KEYWORD+Japan&srnamespace=6&format=json&srlimit=5" \
  | python3 -c "import json,sys; [print(r['title']) for r in json.load(sys.stdin)['query']['search']]"

# Get direct URL from file title
curl -s "https://commons.wikimedia.org/w/api.php?action=query&titles=File:FILENAME.jpg&prop=imageinfo&iiprop=url&format=json" \
  | python3 -c "import json,sys; p=list(json.load(sys.stdin)['query']['pages'].values())[0]; print(p['imageinfo'][0]['url'])"
```
