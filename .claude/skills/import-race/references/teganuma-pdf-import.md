# Teganuma Pdf Import

> How to import 手賀沼トライアスロン (teganuma) — annual official-result PDF, page layout + parsing quirks

手賀沼トライアスロン publishes official-record PDFs (公式記録) yearly. Recent editions (2022+) at `https://teganuman.com/result/`; **older editions (2014-2023) are on MSPO** — listing `https://www.mspo.jp/results`, or grab the result link from each year's event page `https://www.mspo.jp/events/{id}`. MSPO PDF paths vary: `/result/{yy}teganuma_result.pdf` (2022,2023), `/result/{year}/{MMDD}_teganuma.pdf` (2015-2019, sometimes `_new{MMDD}` corrected suffix), `/result/{year}/{M-D}/teganuma/result.pdf` (2014, oldest style). **MSPO 404s on HEAD requests — use GET to probe.** Editions: 2014=9th … 2019=14th (Aug, ~300-370 finishers), 2020/2021 cancelled (COVID), 2022=15th. 2008-2013 (eds 3-8) not found online. event id = `teganuma`; recent editions held mid-June, older ones (≤2022) in August, in 我孫子市/柏市, Chiba. 2019 ran a heat-shortened run (winner run split ~13min).

**PDF page map** (e.g. 2026 = 10 pages): 1-3 個人の部 (individual) → `default.tsv`; 4 デュアスロンの部 → `duathlon.tsv`; 5 リレー (SKIP); 6 パラの部 → `para.tsv`; 7-9 個人の部(年代別順) = same athletes re-sorted (SKIP); 10 市民の部 = subset (SKIP). Mirror the 2025 edition's `categories`/`segments`/`meta_columns` exactly — they're stable year to year (individual has NO 通過 column; duathlon & para DO; para has a ガイド氏名 column).

**Parsing quirks** (use pdfplumber word x0-positions, NOT pdftotext columns):
- Text is **doubled** (overlapping duplicate words) — dedupe by `(round(x0),round(top),text)`.
- **3-digit ranks (100+) start ~x30**, 1-2 digit ranks ~x38 → set the rank bin to start at x30 or you silently drop finishers 100+.
- Include **status rows**: rank token is `DNF`/`DNS`/`DSQ`/`OPEN` at x≈33 (handled by normalize-status.js); the 2025 edition included them, so match.
- 氏名: surname+given split by a single space; if the PDF renders a name as one token, split 4-char as 2+2; 5-char (e.g. 小谷部 典子) and transliterated foreign names need manual fixing.
- 年代別順 (x≈494) excludes overall-award winners (top finishers blank) — just copy the printed value.
- Weather: nearest full-element JMA obs is 千葉 (prec_no=45, block_no=47682); 我孫子 AMeDAS lacks pressure/humidity/dewpoint. See [import-race-discovery](discovery.md).
