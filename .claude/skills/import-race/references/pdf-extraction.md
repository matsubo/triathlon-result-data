# Pdf Extraction

> Generic pdfplumber recipes for result PDFs — table extraction, and the char-level x-position fallback for ruby-contaminated layouts

Two extraction strategies, in order of preference:

1. `page.extract_table()` — works when the PDF has real table structure.
2. Char-level (`page.chars`) with x-position column bucketing — required when text
   extraction interleaves ruby (furigana) with base characters, or when `extract_text()`
   scrambles column order.

```python
import pdfplumber
with pdfplumber.open('result.pdf') as pdf:
    for page in pdf.pages:
        table = page.extract_table()
```

## Char-level recipe (learned from the iseshima 2026 import)

- **Filter ruby glyphs by font size**: ruby renders ~5pt, real content 6pt+. Check
  `sorted(set(round(c['size'],1) for c in page.chars))` first.
- **Cluster rows by `top`** with a tolerance (~10pt); name cells with ruby span two
  baselines within one logical row.
- **Column boundaries — the critical part.** Time columns start at a CONSTANT x for every
  row (fixed-width font, left-aligned). Rank / numeric columns are RIGHT-ALIGNED in their
  slot: a 3-digit rank starts further left than a 1-digit rank. Calibrate each boundary as
  the midpoint between the constant start-x of the following time column and the widest
  (leftmost) extent a rank value can reach — never calibrate against 1-2 digit examples
  only. Get the constant x positions from a frequency count:
  `Counter(round(c['x0'],1) for c in chars)` — positions appearing hundreds of times are
  column starts.
- Some sources publish year-specific column layouts — recalibrate per year.

A boundary bug of exactly this kind silently dropped lap data for 348/567 athletes and was
caught only by the aggregate audit, never by sample rows. See
[validation-pipeline](validation-pipeline.md).

Event-specific page maps and quirks: [teganuma-pdf-import](teganuma-pdf-import.md).
