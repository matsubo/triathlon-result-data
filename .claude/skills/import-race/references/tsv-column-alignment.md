# Tsv Column Alignment

> Verifying imported TSV columns line up with the `segments` / `meta_columns` mapping — and fixing the missing-bib shift

Always verify column alignment **before** committing an import. A one-column shift is
invisible in a spot check and corrupts every row.

## Common pitfall: missing bib (No.) column

Some races publish no bib-number column. The first data column (e.g. surname) then gets
parsed as the bib. Inspect the raw TSV:

```bash
head -5 master/YEAR/RACE_ID/result.tsv | cat -A | head -5
```

Signs of misalignment:
- Bib column contains Japanese text (a name fragment)
- Name column contains numbers embedded with the name

### Detecting split names

If a name like `山田 太郎` appears split (`山田` in the bib column, `太郎` in the name
column), the TSV has one fewer column than expected. Fix by prepending an empty tab to
each data row to shift columns right.

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

## Validate the mapping against the TSV header

The repo-wide check runs on every commit via `.husky/pre-commit` (and in CI):

```bash
bun run check:integrity   # every mapped header must exist in its TSV (header_warnings)
```

A mapped header missing from its TSV is an `unmapped-header` finding of the Category
reader (`scripts/lib/category-reader.js`); `bun scripts/normalize-tsv.js` prints it as a
`Warning: Header mismatch in …` line. To inspect a single edition — note that a TSV may
legitimately carry **unmapped** columns (IRONMAN's `T1` / `T2`, for instance), so this is
a containment check, not an equal-count check:

```bash
bun -e "
import { readCategories } from './scripts/lib/category-reader.js';
import { fsRepo } from './scripts/lib/repo.js';
for (const c of readCategories(fsRepo('.'), { eventId: 'EVENT_ID', date: 'YEAR' }).categories) {
  const mapped = new Set(c.columns().map((col) => col.header));
  console.log(c.def.id, '| findings:', c.findings.map((f) => f.message),
              '| unmapped in tsv:', c.headers.filter((h) => !mapped.has(h)));
}
"
```

Any `unmapped-header` finding is a broken mapping. Unmapped TSV columns are fine as long
as they are genuinely unused.

Build the mapping from the **actual** column captions for that edition — captions vary
year to year even within one event. The structural `extra-columns` rule in
`bun run test:tsv-lint` catches header/row width mismatches repo-wide; see
[data-quality-gates](data-quality-gates.md) for the yokohama 2012-2024 case where a
dropped header column shipped ~8k over-wide rows.
