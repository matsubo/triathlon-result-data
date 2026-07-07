# Claude AI Assistant

## Overview

Claude is an AI assistant created by Anthropic that can help with a wide variety of tasks including code analysis, data processing, documentation, and project management.

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

Claude can help navigate and understand this triathlon result data repository which contains:

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
  weather.json ───┤──→ normalize-tsv.js <event_id> <year> → JSON（stdout）
  race-info.json ─┘
```

出力コマンド: `bun scripts/normalize-tsv.js <event_id> <year>`

## TSVデータ規約

- **氏名の区切り**: 姓と名の間は **半角スペース** を使用する（全角スペース不可）
  - ○ `山田 太郎`
  - × `山田　太郎`（全角スペース）
  - × `山田太郎`（スペースなし） — 大会をまたいだ同一人物の名寄せができなくなるため禁止
  - この規約は `tests/tsv-lint.test.ts` の「Japanese 氏名 values contain a half-width
    space between family and given name」で静的に検査される。チーム名・ニックネーム
    登録（年齢欄が空、または数字・括弧・中黒を含む値）や1文字のみの登録は対象外。
    姓名境界が2分割できない外国人名やニックネーム等、正当な例外は
    `name-space-allowlist.json` に追記する。
  - 新規TSV取り込み時、氏名にスペースがない行を見つけたら他TSVファイルの同名
    参加者（同一人物が複数大会に出ていることが多い）から姓名境界を推定するか、
    Python の `namedivider-python`（GBDTモデル）で分割を推定する。
  - 連続する半角スペース（`佐藤  桂`のような二重スペース）も禁止。原本
    （JTU等）に由来する表記ゆれとして紛れ込むことがあるため、取り込み時に
    正規化する。`tests/tsv-lint.test.ts`の「氏名 values do not contain
    consecutive half-width spaces」で静的に検査される。
- **アルファベット氏名は半角に統一**: 全角英字（`Ｔｏｍ Ｓｍｉｔｈ`）は半角
  （`Tom Smith`）へ変換して取り込む。全角のままだと同一人物の大会横断
  名寄せができない。`tests/tsv-lint.test.ts`の「氏名 values do not contain
  full-width Latin letters」で静的に検査される。

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
- `master/<year>/<id>/result.tsv` 大会のリザルトデータ（入力・非正規化）
- `master/<year>/<id>/weather-data.json` 大会の天気データ
- `scripts/normalize-tsv.js` 大会IDと年を指定して正規化済み JSON を stdout に出力する CLI
- `scripts/lib/normalize-category.js` TSV→正規化athletesの共通ロジック
- `scripts/lib/` 正規化モジュール群（時間、性別、居住地、年齢区分、ステータス等）

### GitHub Workflows (.github/workflows/)

The project includes automated CI/CD workflows for data validation:

- **json-check.yml**: Runs JSON syntax validation using pytest
  - Triggers on changes to JSON files, tests, workflows, or README
  - Uses Python 3.x and pytest for validation
  - Ensures all JSON files have valid syntax

- **validate-race-info.yml**: Validates race information data
  - Triggers on changes to `race-info.json` or `race-info-schema.json`
  - Uses Node.js 22 and ajv-cli for JSON Schema validation
  - Validates race-info.json against its schema

- **validate-weather-data.yml**: Validates weather data files
  - Triggers on changes to weather-data.json files or weather-schema.json
  - Uses Node.js 22 and ajv-cli for JSON Schema validation
  - Finds and validates all weather-data.json files in the master directory
  - Provides detailed validation results for each file

- **check-duplicates.yml**: Detects duplicate race editions by comparing TSV content
  - Triggers on changes to `race-info.json`, `master/**/*.tsv`, or the checker itself
  - Runs `bun run check:duplicates` (scripts/check-duplicate-editions.js)
  - Flags pairs of editions in the same year whose (name, total_time) fingerprints overlap ≥80%
  - Allowlist genuinely distinct lookalikes in `duplicate-allowlist.json`
  - Prevents the scenario where the same physical race is registered under two event_ids (e.g., "IRONMAN 70.3 Japan" vs "IRONMAN 70.3 Centrair Chita Peninsula Japan")

These workflows ensure data integrity and consistency across the repository.

### Lint / Format

- **Biome** (`biome.json`) でJSON・JSファイルのlint + formatを管理
- **Husky** (`.husky/pre-commit`) でコミット時にステージされたファイルを自動チェック
- コマンド: `bun run check`（lint + format一括）、`bun run format`、`bun run lint`

## 新規大会データの取り込み手順

### 1. JTUリザルトシステムからの取り込み

JTU（トライアスロンジャパン）のリザルトページは動的にデータをロードするため、Playwrightでのスクレイピングが必要。

**リザルトURL体系:**
- 大会プログラム一覧: `https://www.jtu.or.jp/result_program/?event_id={ID}`
- 個別リザルト: `https://www.jtu.or.jp/result/?event_id={ID}&program_id={ID}_{N}`

**event_id の年度別レンジ（目安）:**
- 2022年: 124〜169
- 2023年: 172〜232
- 2024年: 239〜310
- 2025年: 309〜374

**スクレイピング手順:**
1. `result_program` ページでプログラム一覧を取得
2. 各プログラムの `result` ページにアクセス
3. `table.result_table` からヘッダーと行データを抽出
4. TSV形式で `master/{year}/{id}/` に保存

**Playwright（Node.js）でのデータ抽出パターン:**
```javascript
const headers = await page.locator('table.result_table thead th').allTextContents();
const rows = await page.locator('table.result_table tbody tr').all();
for (const row of rows) {
  const cells = await row.locator('td').allTextContents();
}
```

**フィルタすべきカテゴリ:** キッズ、ジュニア、リレー、パラ、小学、中学、アクアスロン、デュアスロン、ビギナー、チャレンジ等（メインのエイジグループカテゴリのみ取り込む）

### 2. PDFリザルトからの取り込み

JTU以外の大会（木更津、宮崎シーガイア等）はPDFでリザルトを公開している場合がある。

```python
import pdfplumber
with pdfplumber.open('result.pdf') as pdf:
    for page in pdf.pages:
        table = page.extract_table()
```

### 3. race-info.json への追加

- 既存大会に年度を追加: `editions` 配列に新しいエントリを追加
- 新規大会: `events` 配列に新しいイベントを追加
- TSVヘッダーを確認し、`segments.columns` と `meta_columns` のマッピングを正確に設定
- バリデーション: `bunx ajv-cli validate -s race-info-schema.json -d race-info.json`

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
bunx ajv-cli validate -s race-info-schema.json -d race-info.json
bunx ajv-cli validate -s weather-schema.json -d master/{year}/{id}/weather-data.json
bun scripts/normalize-tsv.js <event_id> <year>   # result-schema.json 検証込み
bun run test:tsv-lint       # 静的規約（氏名スペース・時間形式・順位列・列数整合）
bun run check:duplicates    # 重複エディション検出
bun run check:integrity     # 正規化後の欠損検査（integrity-baseline.json との回帰比較）
```

新規取り込みは `check:integrity` で **欠損ゼロ** が原則。ソース自体に
データが無い場合のみ、コミットメッセージに明記した上で
`bun run scripts/check-integrity.js --update` で baseline に記録する。
既知のデータ品質問題は `tsv-lint-known-issues.json`（静的レベル）と
`integrity-baseline.json`（正規化レベル）に集約されており、いずれも
「将来元ソースから再取り込みして減らす」ための to-fix リスト。増やす
方向の変更は原則禁止。

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
