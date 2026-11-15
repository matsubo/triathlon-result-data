# Aquathlon Import Policy

> Standalone age-group aquathlon championships ARE importable (user-approved 2026-07-13), despite CLAUDE.md's アクアスロン filter

On 2026-07-13 the user approved importing 日本エイジグループアクアスロン選手権
(JTU event 408, program 408_5) as a new event `aquathlon_uminomori` with
`distance: "AQUATHLON"`.

**Why:** CLAUDE.md's "アクアスロンをフィルタ" rule targets side categories
inside triathlon events (kids' aquathlon etc.), not standalone aquathlon
championships. The schema has an AQUATHLON distance for a reason; precedent
also exists in oigawa 2022 (swim-cancelled year modeled as AQUATHLON).

**How to apply:** decide by precedent (SKILL.md → Autonomy), without asking. A
standalone age-group aquathlon championship (a new edition of
`aquathlon_uminomori`, or one like it) is a routine import. An aquathlon that is
not an age-group championship stays out: the IRONMAN "Currents to Kicks" side
events (Oregon 2026-07-17, Washington Tri-Cities 2026-09-18) and JTU 445
TAKANAWA SWIM & RUN FESTA (2026-10-31, anonymous adult table; decided
2026-11-16 in [discovery](discovery.md)). Elite championship / U15 programs
within it stay excluded (non-age-group). Watch the odd columns: YOB (birth
year, NOT age — map to note, never age) and 所属 (affiliation — note, never
residence).
