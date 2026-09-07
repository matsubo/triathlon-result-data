# Mikatiming Csv Import

> mikatiming (Challenge Roth etc.) result import via CSV export endpoint — UA required, per-sex download, cp1252, per-gender place numbering

mikatiming リザルト（例: `datev-challenge-roth.r.mikatiming.com/<year>/`）は CSV エクスポートで決定的に取得できる。SPA/HTML スクレイピング不要。

- エンドポイント: `/<year>/?content=export_list&pid=list&pidp=start&format=csv&event=<year>_roth&num_results=500&page=N&lang=EN`
- ブラウザ User-Agent 必須（curl デフォルト UA と ax は 403）。`num_results` は 500 まで有効、1000 は 25 に fallback。page でページング、25〜500行/頁。
- **エンコーディングは cp1252**（UTF-8 でない。ö→0xf6 で発覚）。
- **性別は `search[sex]=M|W` で分割ダウンロード**して付与する。2016 以降の AK ラベルは接頭辞なし（`45`）で性別導出不可。2021-2024 のエリートは `MELI`/`WELI`、他年は `MPRO`/`WPRO`。
- **place 列は男女別採番**（両性に 1 位が存在）→ overall_rank は総合タイムから再計算、元の place は Gender_Rank へ。
- 氏名は `"Last, First (IOC国コード)"` 形式 → `First Last` へ並べ替え、国コードは IOC→ISO3 変換（GER→DEU, SUI→CHE, ENG/SCO/WLS/NIR→GBR, LIB→LBN, BER→BMU, BAS→ESP）。
- エクスポートはフィニッシャーのみ（DNF/DNS なし）。年によって列構成・言語が変わるため、候補リストによる exact 一致（小文字化）でカラム検出する。'Swim Finish' と 'Swim' の混在があるので部分一致は不可。
- 実装: scratchpad の convert_roth.py 方式（challenge_roth 2012-2025 取り込みで確立、コミット 47bdfbe）。関連 [import-race-discovery](discovery.md) [data-quality-gates](data-quality-gates.md)

## 完走率(DNS)と生年(YOB) — startlist から補完（コミット bfeacdc、2018-2025のみ）

CSV export(`export_list`)は**完走者のみ** → 全員 finished で完走率100%になる。DNF/DNS と生年は無い。両方 **Startlist** から取る:
- URL: `/<year>/?pid=startlist_list&pidp=startlist&event=QC&num_results=100&page=<N>`（UA必須。**startlist_list は curl で静的取得可**。検索フォーム pid=startlist はJS描画で不可）。
- **年で startlist の形式・言語がバラバラ**。判定して使える年だけ処理する:
  - **2018-2025 = card形式**（li.list-group-item）。列ラベルが**言語で違う**: 独 `Startnr./Jg./AK`、英 `Bib Number/YOB/Age Group` → 両方マッチさせる（grab に候補複数）。YOBあり・完走者を全網羅（fin_not_in_reg=0）→ **使える**。
  - **2012-2015 = table形式**（`tr.list-highlight`、列 Nr./Name/Verein/Wettbewerb/**Jahrgang(YOB)**/AK、50行/頁）。Jahrg あるが **startlist不完全**（登録~1600-1700 < 完走2700+、完走者すら半分欠落）→ DNS導出不可、**使わない**。
  - **2016-2017 = startlistが「Ziel」結果表示のみ** → YOB取得不可、**使わない**。
- num_results=100 でも **card=100/頁, table=50/頁**。ページングは「新規bibが増える限り継続、増分0で停止」（固定100件判定は不可）。
- **bib で完走者と突合**（bibは数字→case無関係、完走者⊂登録者で二重計上なし。要検証 fin_not_in_reg==0）。**bib空の行は捨てる**（2022はbib空の重複が4549行混入した。bib有り2879が本物）。
- **非完走者(登録−完走bib)を Overall_Rank=DNS 行で追加** → 完走率 finishers/registrants（2018-2025で78-92%）。DNF/DNS区別はソースに無く全てDNS（既知制約）。
- **Age = 大会年 − YOB**（bib join、完走者にも付与）。ITU/独AKは12/31時点年齢→AKと整合。TSVに Age 列（Division後）、race-info meta_columns に `{header:"Age", role:"age"}` を**該当年エディションだけ**追加（TSV列数が年で16/17に割れるため）。
- 実装: scratchpad sl_scrape.py（card+table両パーサ, 自動fallback）+ sl_merge.py + add_age_meta.mjs。**注意: ネットワークが遅く1頁10-15秒→13年直列で1.5h。年別4並列で短縮した。**
