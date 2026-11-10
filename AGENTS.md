# AI Coding Agent Guide

## Overview

This file is the shared instruction set for AI coding agents working in this repository (Claude Code reads it through the `CLAUDE.md` symlink; Codex and other agents read `AGENTS.md` directly). Agents can help with a wide variety of tasks including code analysis, data processing, documentation, and project management.

## Capabilities in This Project

### Data Analysis
- Analyze triathlon race results from TSV files
- Process weather data and correlate with race performance
- Generate statistical insights from race data across multiple years and locations

### Code Development
- Write Python scripts for data processing and analysis
- Create web applications to visualize race results
- Develop APIs for accessing triathlon data
- Generate test scripts for data validation

### Documentation
- Create comprehensive README files
- Generate API documentation
- Write data schema documentation
- Produce analysis reports

### File Management
- Organize race data by event and edition date (`master/<event_id>/<YYYY-MM-DD>/`)
- Validate JSON schema compliance
- Process and convert data formats
- Manage image assets and metadata

## Project Structure Understanding

Agents can help navigate and understand this triathlon result data repository which contains:

- **Race Results**: TSV files with participant times and rankings
- **Weather Data**: JSON files with race day weather conditions
- **Images**: Race location photos and promotional materials
- **Schemas**: JSON schemas for data validation
- **Configuration**: Package.json and other project setup files

## リポジトリの役割

汚い TSV データを正規化された JSON データとしてアプリケーションへ提供する。

```
入力（master/<event_id>/）
  event.json ───────────────────────┐
  <date>/edition.json ──────────────┤
  <date>/<category_id>.tsv ─────────┤──→ normalize-tsv.js <event_id> <year|date> → JSON（stdout）
  <date>/weather-data.json ─────────┘
```

出力コマンド: `bun scripts/normalize-tsv.js <event_id> <year|date>`（同じ年に複数エディションがある大会は年だと曖昧なので終了コード 1 で日付を列挙する。そのときは `YYYY-MM-DD` で指定する）

## TSVデータ規約

- **氏名の区切り**: 姓と名の間は **半角スペース** を使用する（全角スペース不可）
  - ○ `山田 太郎`
  - × `山田　太郎`（全角スペース）
  - × `山田太郎`（スペースなし） — 大会をまたいだ同一人物の名寄せができなくなるため禁止
  - この規約は `tests/tsv-lint.test.ts` の「Japanese names have a half-width space
    between family and given name」で静的に検査される（`role: "name"` の全列、
    漢字・かなを含む値が対象）。チーム名・ニックネーム
    登録（年齢欄が空、または数字・括弧・中黒を含む値）や1文字のみの登録は対象外。
    姓名境界が2分割できない外国人名やニックネーム等、正当な例外（Exception）は
    `name-space-allowlist.json` の `entries` に追記する。
  - 新規TSV取り込み時、氏名にスペースがない行を見つけたら他TSVファイルの同名
    参加者（同一人物が複数大会に出ていることが多い）から姓名境界を推定するか、
    Python の `namedivider-python`（GBDTモデル）で分割を推定する。
  - 連続する半角スペース（`佐藤  桂`のような二重スペース）も禁止。原本
    （JTU等）に由来する表記ゆれとして紛れ込むことがあるため、取り込み時に
    正規化する。`tests/tsv-lint.test.ts`の「no consecutive half-width
    spaces」（`role: "name"` の全列）で静的に検査される。
- **アルファベット氏名は半角に統一**: 全角英字（`Ｔｏｍ Ｓｍｉｔｈ`）は半角
  （`Tom Smith`）へ変換して取り込む。全角のままだと同一人物の大会横断
  名寄せができない。`tests/tsv-lint.test.ts`の「no full-width Latin
  letters」（`role: "name"` の全列）で静的に検査される。
- **年齢区分は性別を M/F の接頭辞で表記する**: `role: "age_category"` の列で
  性別語（男子/女子/男/女）を含む値は、`M25-29`（男子25-29歳）、`F0-24`
  （女子24歳以下）、`M65+`（男子65歳以上）、`M30-39`（30歳代男子）の形に
  統一する。大会ごとに表記が違うと、同じ区分がアプリ上で別々に表示される
  ため。Import モジュール（`bun scripts/import.js`）は取り込み時に変換する。
  それ以外の手段で書いた TSV は `bun run scripts/fix-age-category-labels.js`
  で変換する（冪等）。年齢と矛盾する区分は破損とみなして変換しない
  （どちらも同じ規則）。`tests/tsv-lint.test.ts` の「年齢区分 values use the canonical M/F
  label…」で静的に検査される。年齢区分ではない部門名（`一般男子`、
  `高校生女子`、`1970年代男子` 等）は Exception として
  `age-category-allowlist.json` の `entries` に追記する。

## ファイル名規約

- **リポジトリ内の全ファイル名は ASCII 文字のみで構成する**（日本語・全角文字・
  全角記号を使わない）。ディレクトリ名・ファイル名いずれも対象。
  - ○ `master/kyoto_tanba/2024-07-07/kyoto_tanba_sprint.tsv`、`miyazaki_standard_men.tsv`
  - × `master/kyoto_tanba/2024-07-07/スプリント.tsv`、`スプリント男子.tsv`
- TSV のファイル名（拡張子を除く）はカテゴリID そのもの（`^[a-z0-9_]+$`）。
  カテゴリ名が日本語でも、カテゴリIDは英数字とアンダースコアへ変換する
  （例: スタンダード→`_standard`、スプリント→`_sprint`、スーパースプリント→
  `_supersprint`、男子/女子→`_men`/`_women`、A/B/Rタイプ→`_type_a`/`_type_b`/`_type_r`）。
- この規約は `tests/tsv-lint.test.ts` の「All filenames under master/ are ASCII」で静的に検査される。

## 固有名詞の表記規約

- **IRONMAN** は固有名詞のためすべて大文字で統一する。`event.json` の
  `name` / `description` / `location`、`edition.json` のカテゴリ `name` /
  `description` など、全フィールドで `Ironman` と書かず `IRONMAN` と書く。
  `IRONMAN 70.3`, `IRONMAN World Championship` 等も同様。

## ファイルの役割

master/ のパスはすべて Event id・Edition の日付・Category id から導出され、どこにも保存しない。

- `master/<event_id>/event.json` Event（大会）の情報。`name`・`location`・`location_parts`・`source`・`description`（任意）・`image_source`（任意、画像のクレジット `{url, author?, license}`）。Event id はディレクトリ名
- `master/<event_id>/image.webp` 大会を象徴する画像。WebP形式、600x400。Event ごとに1枚
- `master/<event_id>/<YYYY-MM-DD>/edition.json` Edition（開催回）のカテゴリ定義 `{ "categories": [...] }`。カテゴリごとに `segments` 配列で競技構成を定義（例: `[{sport:"swim"}, {sport:"bike"}, {sport:"run"}]`）。TSVカラムと正規化フィールドのマッピングルール（`columns`, `meta_columns`）を含む。日付はディレクトリ名（`YYYY-01-01` の仮日付もそのまま）。Event は id 順、Edition は日付順に並ぶ（手で順序を決めない）
- `master/<event_id>/<YYYY-MM-DD>/<category_id>.tsv` 大会のリザルトデータ（入力・非正規化）。カテゴリごとに1ファイルで、ファイル名がカテゴリID（IRONMAN は `<event_id>_<year>.tsv`、その他は `<event_id>.tsv`・`<event_id>_sprint.tsv` 等）
- `master/<event_id>/<YYYY-MM-DD>/weather-data.json` Edition の天気データ。このファイルがあることが「天気あり」を意味する
- `event-schema.json` event.json の JSON Schema、`edition-schema.json` edition.json の JSON Schema（Category / Segment / Column の定義を含む）。どちらも Single Source of Truth
- `schema.ts` TypeScript 型定義（`bun run build:schema` で event-schema.json と edition-schema.json から生成。CorpusEvent / CorpusEdition / CorpusCategory 型も含む）
- `scripts/lib/layout.js` master/ のパスを組み立て・解釈する唯一のモジュール（`eventJsonPath` / `imagePath` / `editionDir` / `editionJsonPath` / `tsvPath` / `weatherPath` / `classify`）。master/ のパスを文字列で組み立てるコードは書かず、このモジュールを使う
- `scripts/lib/corpus.js` `readCorpus(repo, where?)` が master/ 全体を読み、`{ events, findings }` を返す。Event には導出された `id`・`image`・`editions`（各 Edition は `date`・`weather_file`（無ければ null）・`categories`（導出された `result_tsv` 付き））が付く。レイアウトの欠陥（想定外のファイル、event.json・image.webp・edition.json の欠落、空の Event、カテゴリIDの重複）は Finding として返す。`eventFile` / `editionFile` が event.json / edition.json を書き出す形式（2スペースインデント + 末尾改行）を決める
- `scripts/normalize-tsv.js` 大会IDと年（または日付）を指定して正規化済み JSON を stdout に出力する CLI（Edition document モジュールの薄いラッパー）
- `scripts/import.js` Import モジュール（`scripts/lib/import.js`）の CLI。取り込みプランから新しい Edition ディレクトリ（TSV と edition.json）と、新規大会なら event.json だけを書き込む。他の Event は書き換えない
- `scripts/lib/category-reader.js` Category reader モジュール。`readCorpus` の上に作られ、`readCategories(repo, where?)` が全カテゴリと TSV を Column role 単位で読む（`columns(role)` / `rows` / `cells(role)`）。`parseCategory(def, text)` はリポジトリなしで1カテゴリを読む。データ欠陥（TSV の欠落、存在しないヘッダー等）は Finding として返す。TSV のセルを役割で書き換える `rewriteCells` も持つ。TSV を読むスクリプト・テストはヘッダー文字列ではなくこのモジュールを使う
- `scripts/lib/edition-document.js` Edition document モジュール。`editionDocument(repo, eventId, dateOrYear)` が1エディションの正規化 JSON を組み立てて result-schema.json で検証する
- `scripts/lib/segment-pace.js` Segment pace モジュール。カテゴリの各種目について完走者のラップ中央値からペースを求め、妥当な範囲外のペースや同じ大会の他エディションからのずれ（＝申告距離が当日のコースと違う疑い）を検出する。Import のペース警告と `check:integrity` の `implausible_pace` が使う。全件のレポートは `bun scripts/report-segment-pace.js`
- `scripts/lib/` 正規化モジュール群（時間、性別、居住地、年齢区分、ステータス等）

### GitHub Workflows (.github/workflows/)

One workflow, **ci.yml** (`CI`), runs on every push to `main`, every pull request,
and on manual dispatch. It has no path filters, so every change runs every check.
It sets up Bun, runs `bun install`, then:

1. `bun run test` — every `tests/*.test.ts` (JSON syntax, every
   `event.json` / `edition.json` / `weather-data.json` against
   `event-schema.json` / `edition-schema.json` / `weather-schema.json`, TSV
   lint including "no layout findings", every Event's `image.webp` exists and
   is WebP, normalizer unit tests) followed by `tsc --noEmit`
2. `bun run check:integrity` — normalizes every Edition (validating each
   against `result-schema.json`) and compares header-warning, unknown status
   token, missing-value and implausible Segment pace counts against
   `integrity-baseline.json`; a schema
   failure, a layout finding of `readCorpus` (unexpected file under master/,
   missing event.json / image.webp / edition.json, empty Event, duplicate
   Category) or a finding of the Category reader fails it outright
3. `bun run check:duplicates` — flags pairs of Editions in the same year whose
   (name, total_time) fingerprints overlap ≥80%; allowlist genuinely distinct
   lookalikes in `duplicate-allowlist.json`

Running these three commands locally reproduces CI exactly.

### Lint / Format

- **Biome** (`biome.json`) でJSON・JSファイルのlint + formatを管理
- **Husky** (`.husky/pre-commit`) でコミット時にステージされたファイルを自動チェック
- コマンド: `bun run check`（lint + format一括）、`bun run format`、`bun run lint`

## 新規大会データの取り込み手順

取り込みは **Import モジュール** で行う。一回限りの add-* / import-* スクリプトは書かない。
手順の詳細は `.claude/skills/import-race/SKILL.md`（ステップ4）と同ディレクトリの
`references/` を参照。

### 1. 取り込みプランを書く

プランはリポジトリ外の JSON ファイル（例: `/tmp/import-plan.json`、コミットしない）。
スキーマは `scripts/lib/import-plan-schema.json`。

```json
{
  "events": [],
  "editions": [
    { "event": "im703_porec", "date": "2026-10-18", "ironman": "<subevent uuid>" },
    { "event": "chibacity", "date": "2026-10-11",
      "jtu": [{ "program": "436_3", "distance": "SD", "description": "…" }] }
  ]
}
```

- **IRONMAN**: labs-v2 のサブイベント uuid を `ironman` に指定する。テンプレート（full / 70.3）は既存エディションの distance から推定する（新規大会・混在時は `template` を指定）。
- **JTU**: 取り込むプログラムごとに `jtu[]` を1件。JSON API（`results.jtu.or.jp/api`）から取得する。`jtu.or.jp/result` の SPA は Playwright でスクレイピングしない（カルーセルで他大会の表が混入する）。キャプションの列ロールは `scripts/lib/results-sources/jtu.js` の語彙で決まり、未知のキャプションはエラーになる（プランの `columns.rename` / `drop` で対処）。
- **PDF・CSV 等**: リポジトリ外で TSV を作り（PDF は `pdfplumber`）、`prepared[]` に列マッピングとともに指定する。
- **新規大会**: `events[]` に `id`・`name`・`location`（任意）・`location_parts`・`source`・`description`（任意）・`image_source`（任意、画像のクレジット）を書く。`image` フィールドはない。取り込みの **前に** 画像を `master/<id>/image.webp` に置く（無いとプラン不正）。他の大会の image.webp とバイト単位で同じ画像はプラン不正になる（コピーの使い回し不可）。
- **フィルタすべきカテゴリ:** キッズ、ジュニア、リレー、パラ、小学、中学、アクアスロン、デュアスロン、ビギナー、チャレンジ等（メインのエイジグループカテゴリのみ取り込む）。1つの表の中に部門列がないかも確認する。
- コースが標準と違う場合は `segments` で距離を指定する。中止された種目（スイム中止など）は `segments` から省くことでのみ表す。
- **種目距離は当日の実績から決める**: リザルトのコース注記、JTU の `/api/programs/<pid>/additionals`、当日のアナウンス、大会レポートを根拠にする。募集要項や前回エディションの距離はコピーしない（スイムの短縮・中止や暑さによるランの短縮は当日に決まることが多い）。
- **当日の短縮・変更で `distance`（Distance class）は変えない**: 種別は大会がどの形式として実施されたかを表す（スイムが短縮された OD は OD のまま）。実際に走った距離は `segments` の各 `distance` に書く。種別を変えるのは、カテゴリがそもそも誤った形式で登録されていた場合だけ。

### 2. 実行する

```bash
bun scripts/import.js /tmp/import-plan.json --dry-run   # 書き込みはメモリ上のみ
bun scripts/import.js /tmp/import-plan.json             # TSV → edition.json →（新規大会なら）event.json の順に書き込む
```

結果は JSON のレポートで出力される（`written` に書き込んだパス）。終了コード 0 = 全エディション取り込み済み、2 = 一部スキップ（`reason` を確認）、1 = プラン不正（何も書き込まない）。
カテゴリID・`segments` / `meta_columns`・`source_ref`、スキーマ検証はモジュールが行う。ファイルのパスはカテゴリID と日付から導出される（`scripts/lib/layout.js`）ので指定しない。エディションの順序も日付順に決まるので指定しない。ディレクトリにファイルがあるのに edition.json が無いエディションはスキップされる。PRO のみの速報、TSV の完全一致（混入）、既存エディションとの Source reference 不一致などは自動で拒否される。

取り込みごとに種目ラップの中央値を確認する。中央値から求めたペースが妥当な範囲外の種目や、同じ大会の他エディションの同じ距離と 1.4 倍以上ずれる種目は、レポートの `warnings` にペース警告として出る（`scripts/lib/segment-pace.js`）。ペース警告は当日のコースを調べて `segments` を直す。当日の根拠からペースが本物だと分かった警告（強い潮流のスイム、PRO だけのカテゴリ等）は `pace-exceptions.json` に根拠の URL とともに Exception として追加する。どちらでもない警告は `check:integrity` の `implausible_pace` で失敗する。

### 3. 既存エディションの再取得

`"mode": "refetch"` を指定すると、各カテゴリの `source_ref` から再取得して TSV だけを更新する。ヘッダーが変わった場合や順位の品質（重複のない順位数・順位とタイムの逆転数）が劣化する場合は拒否される。

### 4. 天気データの生成

Import モジュールは天気データを書かない。取り込み後に生成する。

- 国内は気象庁（JMA）の過去の気象データを使用（`scripts/gen-weather-jma.py`、海外は `scripts/gen-weather-open-meteo.py`。どちらも `--out` に出力先のパスを指定する）
- 最寄りのAMeDAS観測所のデータを取得
- `master/<event_id>/<YYYY-MM-DD>/weather-data.json` に `weather-schema.json` に従ったJSON形式で保存する。このファイルがあることが Edition の「天気あり」を意味する（どこにも登録しない）
- 3時間ごと（3, 6, 9, 12, 15, 18, 21, 24時）のデータを含める

### 5. 大会画像

- `master/<event_id>/image.webp` に置く。WebP形式、ちょうど 600x400px（リサイズ・クロップして合わせる）
- 各大会の開催地を象徴する風景写真を使用
- **プレースホルダー画像の使い回しは不可** — 必ず個別の画像を設定する。他の大会の画像をコピーしない（バイト単位で同じ画像は Import モジュールが拒否する）
- 画像のクレジットはその大会の `event.json` の `image_source`（`{url, author?, license}`）に記録する

### 6. 検証と出力確認

```bash
bun run test:schema         # 全 event.json ↔ event-schema.json、全 edition.json ↔ edition-schema.json
bun run test:weather        # 全 weather-data.json ↔ weather-schema.json
bun scripts/normalize-tsv.js <event_id> <year>   # result-schema.json 検証込み
bun run test:tsv-lint       # 静的規約（氏名スペース・時間形式・順位列・列数整合）
bun run check:duplicates    # 重複エディション検出
bun run check:integrity     # 正規化後の検査（result-schema.json 検証、レイアウトの欠陥（想定外のファイル等）の検出、integrity-baseline.json の件数との一致を確認）
```

新規取り込みは `check:integrity` で **欠損ゼロ** が原則。ソース自体に
データが無い場合のみ、コミットメッセージに明記した上で
`bun run update:integrity-baseline` で ledger に記録する。

既知のデータ品質問題（Known issue）は Known-issue ledger に件数で集約されて
いる: `tsv-lint-known-issues.json`（静的レベル、ルール×TSVパス）と
`integrity-baseline.json`（正規化レベル、ルール×カテゴリ。キーは `<event>/<YYYY-MM-DD>/<category>`）。形式はどちらも
`{ "description", "rules": { ルール: { キー: 件数 } } }` で、
`scripts/lib/known-issue-ledger.js` が読み書きする。いずれも「将来元ソースから
再取り込みして減らす」ための to-fix リストで、増やす方向の変更は原則禁止。
件数は減る方向にしか動かないので（docs/adr/0002-known-issue-counts-only-shrink.md）、
チェックは件数の増加（regression）だけでなく、減少（improvement）や検査対象から
消えたキーの残存（stale）でも失敗する。データを直して件数が減ったら
`bun run update:tsv-lint-known-issues` / `bun run update:integrity-baseline` で
ledger を現在の件数に縮め、同じコミットに含める。

正しいデータだがルールに合わない値（Exception）は欠陥ではないので件数を持たず、
ledger にも含めない: `name-space-allowlist.json`、`age-category-allowlist.json`、
`duplicate-allowlist.json`、`pace-exceptions.json`。形式はどれも `{ "description", "entries": [...] }` で、
`scripts/lib/exceptions.js` が読む。当日の根拠からペース警告（`implausible_pace`）が本物だと分かった種目は、ledger に残さず
`pace-exceptions.json` に 1 種目 1 エントリ（`event`・`date`・`category`・`segment`・`reason`・`source`）で追加する。

## distance の種別

| 値 | 総距離目安 | 説明 |
|---|---------|------|
| LD | 150km〜 | ロングディスタンス（スイム3km以上、バイク120km以上、フルマラソン級ラン） |
| MD | 60〜150km | ミドルディスタンス（OD超〜LD未満。51.5km×2前後の102km系、90km前後のKIN等を含む） |
| OD | 約51.5km | オリンピックディスタンス（スイム1.5km, バイク40km, ラン10km） |
| SD | 約25.75km | スプリントディスタンス（スイム0.75km, バイク20km, ラン5km） |
| SS | SD未満 | スーパースプリント |
| DUATHLON | - | デュアスロン（ラン-バイク-ラン、スイムなし） |
| AQUATHLON | - | アクアスロン（スイム-ラン、バイクなし） |
| OTHER | - | その他（TTなど） |
