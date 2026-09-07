# Duathlon Import Policy

> Standalone age-group duathlon events ARE importable (user-approved 2026-08-03), same precedent as aquathlon

On 2026-08-03 the user approved importing 3 standalone JTU duathlon editions as
2 new events: `higashiogishima_duathlon` (CalfMan Signature in 東扇島, Kawasaki —
editions 2025-02-16 event_id 307, 2026-02-15 event_id 378) and
`nagaragawa_duathlon` (CalfMan Signature 長良川デュアスロン, Kaizu/Gifu — edition
2025-11-23 event_id 377). Repo previously had zero standalone duathlon events
(DUATHLON distance only existed as a sub-category inside triathlon events like
teganuma/komatsu_tetsujin/tateyama). See also [aquathlon-import-policy](aquathlon-import-policy.md).

**Why:** Same reasoning as the aquathlon precedent — CLAUDE.md's category
filter targets side-categories within triathlon event weekends, not
standalone championship-caliber duathlon races. Schema already has a
DUATHLON distance for a reason.

**How to apply:** During /import-race discovery, list standalone duathlon
events as candidates for confirmation rather than silently dropping them
(same treatment as aquathlon). Distance for this "CalfMan Signature" series, confirmed via WebSearch (not
guessed from splits): **Run 5km / Bike 30km / Run 5km**, 40km total, for the
age-group category (other categories are shorter for students/juniors/
elementary). JTU
duathlon tables include both エイジクラス (age class) and シチズンクラス
(citizen class, no age-rank column) — both are legitimate age-group-style
imports, not just エイジクラス. Elite/student/beginner/junior/kids programs
stay excluded per the usual filter.
