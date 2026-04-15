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

## 固有名詞の表記規約

- **IRONMAN** は固有名詞のためすべて大文字で統一する。`race-info.json` の
  `name` / `description` / `location` など、全フィールドで `Ironman` と書
  かず `IRONMAN` と書く。`IRONMAN 70.3`, `IRONMAN World Championship` 等
  も同様。

## ファイルの役割

- `race-info.json` 大会情報のマスタ。カテゴリごとに `segments` 配列で競技構成を定義（例: `[{sport:"swim"}, {sport:"bike"}, {sport:"run"}]`）。TSVカラムと正規化フィールドのマッピングルール（`columns`, `meta_columns`）を含む。
- `race-info-schema.json` race-info.json の JSON Schema（Single Source of Truth）
- `schema.ts` TypeScript 型定義（race-info-schema.json から派生）
- `images/` 大会を象徴する画像。webp形式。300x200以内に収まる大きさ。
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

- webp形式、300x200px以内
- 各大会の開催地を象徴する風景写真を使用
- **プレースホルダー画像の使い回しは不可** — 必ず個別の画像を設定する

### 6. 検証と出力確認

```bash
bunx ajv-cli validate -s race-info-schema.json -d race-info.json
bunx ajv-cli validate -s weather-schema.json -d master/{year}/{id}/weather-data.json
bun scripts/normalize-tsv.js <event_id> <year>
```

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
