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
- Organize race data by year, location, and race type
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
入力（master/）
  result.tsv ─────┐
  weather.json ───┤──→ normalize-tsv.js <event_id> <year|date> → JSON（stdout）
  race-info.json ─┘
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
  - ○ `master/2024/kyoto_tanba/standard.tsv`、`sprint_men.tsv`、`type_a.tsv`
  - × `master/2024/kyoto_tanba/スタンダード.tsv`、`スプリント男子.tsv`
- カテゴリ名が日本語でも、TSVファイル名は英数字とアンダースコアへ変換する
  （例: スタンダード→`standard`、スプリント→`sprint`、スーパースプリント→
  `supersprint`、男子/女子→`_men`/`_women`、A/B/Rタイプ→`type_a`/`type_b`/`type_r`）。
- この規約は `tests/tsv-lint.test.ts` の「All filenames under master/ and images/ are ASCII」で静的に検査される。

## 固有名詞の表記規約

- **IRONMAN** は固有名詞のためすべて大文字で統一する。`race-info.json` の
  `name` / `description` / `location` など、全フィールドで `Ironman` と書
  かず `IRONMAN` と書く。`IRONMAN 70.3`, `IRONMAN World Championship` 等
  も同様。

## ファイルの役割

- `race-info.json` 大会情報のマスタ。カテゴリごとに `segments` 配列で競技構成を定義（例: `[{sport:"swim"}, {sport:"bike"}, {sport:"run"}]`）。TSVカラムと正規化フィールドのマッピングルール（`columns`, `meta_columns`）を含む。
- `race-info-schema.json` race-info.json の JSON Schema（Single Source of Truth）
- `schema.ts` TypeScript 型定義（race-info-schema.json から派生）
- `images/` 大会を象徴する画像。webp形式。600x400以内に収まる大きさ。
- `master/<year>/<dir>/<file>.tsv` 大会のリザルトデータ（入力・非正規化）。カテゴリごとに1ファイル。パスは各カテゴリの `result_tsv` が正（IRONMAN は `master/<year>/<event_id>_<year>/default.tsv`、その他は `master/<year>/<event_id>/default.tsv`・`sprint.tsv` 等。古いエディションには `result.tsv` もある）
- `master/<year>/<id>/weather-data.json` 大会の天気データ
- `scripts/normalize-tsv.js` 大会IDと年（または日付）を指定して正規化済み JSON を stdout に出力する CLI（Edition document モジュールの薄いラッパー）
- `scripts/import.js` Import モジュール（`scripts/lib/import.js`）の CLI。取り込みプランから TSV と race-info.json のエディションを書き込む
- `scripts/lib/category-reader.js` Category reader モジュール。`readCategories(repo, where?)` が race-info.json の全カテゴリと TSV を Column role 単位で読む（`columns(role)` / `rows` / `cells(role)`）。データ欠陥（未登録 TSV、存在しないヘッダー等）は Finding として返す。TSV のセルを役割で書き換える `rewriteCells` も持つ。TSV を読むスクリプト・テストはヘッダー文字列ではなくこのモジュールを使う
- `scripts/lib/edition-document.js` Edition document モジュール。`editionDocument(repo, eventId, dateOrYear)` が1エディションの正規化 JSON を組み立てて result-schema.json で検証する
- `scripts/lib/` 正規化モジュール群（時間、性別、居住地、年齢区分、ステータス等）

### GitHub Workflows (.github/workflows/)

One workflow, **ci.yml** (`CI`), runs on every push to `main`, every pull request,
and on manual dispatch. It has no path filters, so every change runs every check.
It sets up Bun, runs `bun install`, then:

1. `bun run test` — every `tests/*.test.ts` (JSON syntax and path references,
   race-info.json and weather-data.json against their JSON Schemas, TSV lint,
   image references, normalizer unit tests) followed by `tsc --noEmit`
2. `bun run check:integrity` — normalizes every Edition (validating each
   against `result-schema.json`) and compares header-warning, unknown status
   token and missing-value counts against `integrity-baseline.json`; a schema
   failure or a corpus finding of the Category reader (repeated Edition,
   shared or unregistered TSV) fails it outright
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
- **新規大会**: `events[]` に追加する（画像は先に `images/` へ置く）。
- **フィルタすべきカテゴリ:** キッズ、ジュニア、リレー、パラ、小学、中学、アクアスロン、デュアスロン、ビギナー、チャレンジ等（メインのエイジグループカテゴリのみ取り込む）。1つの表の中に部門列がないかも確認する。
- コースが標準と違う場合は `segments` で距離を指定する。中止された種目（スイム中止など）は `segments` から省くことでのみ表す。

### 2. 実行する

```bash
bun scripts/import.js /tmp/import-plan.json --dry-run   # 書き込みはメモリ上のみ
bun scripts/import.js /tmp/import-plan.json             # TSV → race-info.json の順に書き込む
```

結果は JSON のレポートで出力される。終了コード 0 = 全エディション取り込み済み、2 = 一部スキップ（`reason` を確認）、1 = プラン不正（何も書き込まない）。
カテゴリID・`result_tsv` パス・`segments` / `meta_columns`・`source_ref`・`weather_file`、エディションの日付順の配置、スキーマ検証はモジュールが行う。PRO のみの速報、TSV の完全一致（混入）、既存エディションとの Source reference 不一致などは自動で拒否される。

### 3. 既存エディションの再取得

`"mode": "refetch"` を指定すると、各カテゴリの `source_ref` から再取得して TSV だけを更新する。ヘッダーが変わった場合や順位の品質（重複のない順位数・順位とタイムの逆転数）が劣化する場合は拒否される。

### 4. 天気データの生成

- 気象庁（JMA）の過去の気象データを使用
- 最寄りのAMeDAS観測所のデータを取得
- `weather-schema.json` に従ったJSON形式で保存
- 3時間ごと（3, 6, 9, 12, 15, 18, 21, 24時）のデータを含める

### 5. 大会画像

- webp形式、600x400px以内
- 各大会の開催地を象徴する風景写真を使用
- **プレースホルダー画像の使い回しは不可** — 必ず個別の画像を設定する

### 6. 検証と出力確認

```bash
bun run test:schema         # race-info.json ↔ race-info-schema.json
bun run test:weather        # 全 weather-data.json ↔ weather-schema.json
bun scripts/normalize-tsv.js <event_id> <year>   # result-schema.json 検証込み
bun run test:tsv-lint       # 静的規約（氏名スペース・時間形式・順位列・列数整合）
bun run check:duplicates    # 重複エディション検出
bun run check:integrity     # 正規化後の検査（result-schema.json 検証、未登録 TSV 等の検出、integrity-baseline.json の件数との一致を確認）
```

新規取り込みは `check:integrity` で **欠損ゼロ** が原則。ソース自体に
データが無い場合のみ、コミットメッセージに明記した上で
`bun run update:integrity-baseline` で ledger に記録する。

既知のデータ品質問題（Known issue）は Known-issue ledger に件数で集約されて
いる: `tsv-lint-known-issues.json`（静的レベル、ルール×TSVパス）と
`integrity-baseline.json`（正規化レベル、ルール×カテゴリ）。形式はどちらも
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
`duplicate-allowlist.json`。形式はどれも `{ "description", "entries": [...] }` で、
`scripts/lib/exceptions.js` が読む。

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
