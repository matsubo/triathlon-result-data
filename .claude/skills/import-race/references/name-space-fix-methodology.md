# Name Space Fix Methodology

> How to bulk-fix TSV 氏名 fields missing the family/given-name half-width space, and where the resulting lint/allowlist live

On 2026-07-01, found `master/2022/kisarazu/default.tsv` had zero half-width
spaces in any 氏名 value (`星大樹` instead of `星 大樹`), breaking cross-race
name matching. A repo-wide scan (`tests/tsv-lint.test.ts` now runs this check
every time) turned up the same problem in 105 files, ~2701 names total.

**Fix methodology** (recover the family/given split without a canonical
Japanese surname dictionary):
1. Build a corpus of every already-spaced 氏名 value across all `master/**/*.tsv`
   (concatenated-no-space form → spaced form + frequency). Triathletes race
   repeatedly, so most unspaced names already appear correctly spaced in some
   other year/event — this alone resolved ~85% of the 2701 cases (exact match
   or majority vote when a concat form had >1 observed split).
2. For names absent from the corpus, derive surname/given-name frequency
   dictionaries from the same corpus and try every split point; if exactly one
   split point yields both a known surname and a known given name, use it.
3. For names still unresolved, use `namedivider-python`'s `GBDTNameDivider`
   (`pip3 install namedivider-python`) — a pretrained model for exactly this
   task. Score threshold ~0.45 separates real kanji personal names from
   team/nickname strings reasonably well, but false positives exist around
   0.5–0.58 (e.g. `橋本病院`, `助松女子` scored in that range) — don't trust
   score alone.
4. Never force-split: rows with a blank 年齢 (age) column are this repo's
   convention for team/relay/nickname sign-ins (confirmed via the `hiwasa`
   race, which lets people register joke names like `ヒトカラメディア`,
   `美魔女`); rows containing digits/parentheses/nakaguro are the same. Single
   *character* names (1 kanji) can't be split at all — also a `hiwasa`
   quirk (participants sign in with just a surname character sometimes).
   Katakana foreign names split unreliably by both the corpus heuristic and
   GBDT (trained on kanji) — resolve these by hand or leave alone; 3-part
   Western/Indonesian names (e.g. `ファンデルフリート`, `バユプラウィラサリム`)
   don't fit this repo's one-space convention at all.
5. Whatever can't be resolved goes in `name-space-allowlist.json` at repo
   root, which `tests/tsv-lint.test.ts` reads to exempt those exact name
   strings from the check.

See `sport-enum-schema-gap` for a similar repo-wide data-quality gap found
the same way (grep across `master/`, not just trust `race-info.json`).
