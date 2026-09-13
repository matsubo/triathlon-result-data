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

The repo-wide check already exists and runs on every commit via `.husky/pre-commit`:

```bash
bun run scripts/validate-headers.js   # every mapped header must exist in its TSV
```

To inspect a single edition — note that `segments[].columns[]` and `meta_columns[]` both
key on `header`, and that a TSV may legitimately carry **unmapped** columns (IRONMAN's
`T1` / `T2`, for instance), so this is a containment check, not an equal-count check:

```bash
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('race-info.json'));
const event = data.events.find(e => e.id === 'EVENT_ID');
const edition = event.editions.find(e => e.date.startsWith('YEAR'));  // editions key off date, not a year field
for (const cat of edition.categories) {
  const mapped = [
    ...(cat.segments||[]).flatMap(s => (s.columns||[]).map(c => c.header)),
    ...(cat.meta_columns||[]).map(m => m.header),
  ];
  const tsv = fs.readFileSync(cat.result_tsv, 'utf8').split('\n')[0].split('\t').map(h => h.trim());
  const missing = mapped.filter(h => !tsv.includes(h));
  console.log(cat.id, '| mapped:', mapped.length, '| tsv:', tsv.length,
              '| unmapped in tsv:', tsv.filter(h => !mapped.includes(h)),
              '| MISSING from tsv:', missing);
}
"
```

Any nonempty `MISSING` is a broken mapping. Unmapped TSV columns are fine as long as they
are genuinely unused.

Build the mapping from the **actual** column captions for that edition — captions vary
year to year even within one event. The structural `extra-columns` rule in
`bun run test:tsv-lint` catches header/row width mismatches repo-wide; see
[data-quality-gates](data-quality-gates.md) for the yokohama 2012-2024 case where a
dropped header column shipped ~8k over-wide rows.
