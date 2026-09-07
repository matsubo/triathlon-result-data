# Aquathlon Import Policy

> Standalone age-group aquathlon championships ARE importable (user-approved 2026-07-13), despite CLAUDE.md's アクアスロン filter

On 2026-07-13 the user approved importing 日本エイジグループアクアスロン選手権
(JTU event 408, program 408_5) as a new event `aquathlon_uminomori` with
`distance: "AQUATHLON"`.

**Why:** CLAUDE.md's "アクアスロンをフィルタ" rule targets side categories
inside triathlon events (kids' aquathlon etc.), not standalone aquathlon
championships. The schema has an AQUATHLON distance for a reason; precedent
also exists in oigawa 2022 (swim-cancelled year modeled as AQUATHLON).

**How to apply:** during /import-race discovery, a standalone age-group
aquathlon event is a legitimate candidate — list it for confirmation rather
than silently dropping it. Elite championship / U15 programs within it stay
excluded (non-age-group). Watch the odd columns: YOB (birth year, NOT age —
map to note, never age) and 所属 (affiliation — note, never residence).
