# Image Policy

> Every event needs its own `master/<event_id>/image.webp` — how to find, fetch and convert one, and how to verify none are missing

**Every event MUST have a unique image** at `master/<event_id>/image.webp` (600×400
WebP). Never copy another Event's image, and never reuse a placeholder across events.

## Verify no event is missing its image

```bash
bun run test:images
```

It checks that every Event's `master/<event_id>/image.webp` exists and is WebP; a
missing image is also a layout finding (`missing-image`) that fails `check:integrity`.
Uniqueness: the importer rejects a new Event whose `image.webp` is byte-identical to
another Event's, and `tests/images.test.ts` fails when any two Events' images are, so
each image's bytes must be unique across `master/`.

## Crediting the image

Every Event must record the source in its `master/<event_id>/event.json` as `image_source`
(required by `schemas/event.schema.json`): `{ "url": "…", "author": "…", "license": "…" }`
(`author` optional). For a new Event, put it in the plan's `events[]` entry (required
there too) and the importer writes it to `event.json`.

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
magick /tmp/src.jpg -resize 600x400^ -gravity center -extent 600x400 -quality 82 master/EVENT_ID/image.webp
```

**Key rules:**
- Use **direct** upload.wikimedia.org URLs (e.g. `/wikipedia/commons/a/ab/File.jpg`), NOT
  thumbnail paths (`/thumb/...`)
- Use `magick` (ImageMagick 7) — `ffmpeg` does not support webp output on this system
- Size: 600×400px — what every `master/<event_id>/image.webp` actually is, and the limit
  CLAUDE.md states. `-resize 600x400^ -gravity center -extent 600x400` fills and
  centre-crops to exactly that.
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
