# Multi-Sport Race Result Data

[![JSON Syntax Check](https://github.com/matsubo/triathlon-result-data/actions/workflows/json-check.yml/badge.svg)](https://github.com/matsubo/triathlon-result-data/actions/workflows/json-check.yml)
[![Validate Race Info](https://github.com/matsubo/triathlon-result-data/actions/workflows/validate-race-info.yml/badge.svg)](https://github.com/matsubo/triathlon-result-data/actions/workflows/validate-race-info.yml)
[![Validate Weather Data](https://github.com/matsubo/triathlon-result-data/actions/workflows/validate-weather-data.yml/badge.svg)](https://github.com/matsubo/triathlon-result-data/actions/workflows/validate-weather-data.yml)

## このリポジトリの目的

様々なスポーツの大会が開かれており、スポーツの形や種目・方法は多様化してきています。しかし、その中でも普遍的なものは**他者との競技性**です。競技性がある限り、自分や他者のパフォーマンスの分析は普遍的に価値があります。

当初はトライアスロンだけをスコープとしていましたが、デュアスロン・アクアスロン・マラソンなど多くのスポーツでも同じユースケースがあることがわかりました。

このリポジトリの使命は、**非正規化された大会リザルトデータ（TSV）を正規化し、JSON Schema + JSON データとして上位のアプリケーションへ提供すること**です。

### 提供するもの

アプリケーションに提供するのは **2つだけ** です:

1. **JSON Schema**（`result-schema.json`）— データの契約
2. **JSON データ**（`dist/data.json`）— 正規化された全レース・全選手データ

アプリケーション側は TSV パーサーやヘッダーマッピングのロジックを持つ必要がありません。

このリポジトリに入っているレースの結果を [AI TRI+](https://ai-triathlon-result.teraren.com/) のサイトで分析できるようになっています。

## アーキテクチャ

```
入力（master/）                         出力（dist/）
  *.tsv（非正規化リザルト）──┐
  weather-data.json ────────┤── bun run build ──→ data.json（正規化済み）
  race-info.json（マッピング）┘                    result-schema.json（契約）
```

## データモデル

```
Event（大会）
  └── Edition（開催日）
        ├── Weather（天気）
        └── Category（カテゴリ）
              ├── Segments（競技構成: swim, bike, run の順序付き配列）
              └── Athletes（選手リザルト）
```

- **Event**: 大会そのもの（例: 横浜トライアスロン）
- **Edition**: 年度ごとの開催（例: 2025-05-18）。天気情報を含む
- **Category**: 同一大会内の種目区分（例: OD, Sprint, デュアスロン）
- **Segments**: 競技構成を `[{sport, distance_km}]` の配列で定義。トライアスロン以外にもデュアスロン（run-bike-run）、アクアスロン（swim-run）、マラソン（run）、スイム中止大会（bike-run）に対応
- **Athlete**: 各選手の正規化されたリザルト（順位、タイム、セグメント別データ）

## データの追加方法

### 大会マスタの追加

`race-info.json` を編集してください。レース、開催日、カテゴリのツリー構造になっています。

### 大会画像の追加

`images/` ディレクトリに横400px, 縦300px程度の大会を象徴する画像を保存してください。フォーマットは webp です。

### 天気情報の追加

レース日・場所の天気情報を JSON 形式で用意してください。

```
master/<year>/<event_id>/weather-data.json
```

天気データは `weather-schema.json` で定義された JSON Schema に従って作成してください。過去の天気は [tenki.jp](https://tenki.jp/past/2025/04/weather/) を参考に取得できます。

### リザルトの追加

TSV ファイルを以下の場所に追加してください:

```
master/<year>/<event_id>/<category>.tsv
```

ヘッダ名は元のリザルトデータをそのまま使って構いません。`race-info.json` にカラムマッピング（`columns`, `meta_columns`）を定義することで、ビルド時に正規化されます。

リザルトを追加したい場合は Issue か Pull Request をお送りください。

## アプリケーション向け：正規化データの利用

`bun run build` を実行すると、TSV + race-info.json + 天気データから正規化された JSON が生成されます。

```
result-schema.json       # 出力データの JSON Schema
dist/
└── data.json            # 全レース・全選手の正規化データ
```

### 正規化ルール

| フィールド | 変換 |
|-----------|------|
| 時間 | `"2:02:41"` → `7361`（秒数） |
| 性別 | `"男"` → `"M"`, `"女"` → `"F"` |
| 都道府県 | `"神奈川県"` → `"JP-14"`（ISO 3166-2:JP） |
| 国名 | `"United States"` → `"US"`（ISO 3166-1 alpha-2） |
| 年齢区分 | `"N25-29"` → `{"min_age": 25, "max_age": 29}` |
| 順位/ステータス | `"DNF"` → `rank: null, status: "DNF"` |

### ステータス値

| 値 | 意味 |
|----|------|
| `finished` | 完走 |
| `DNF` | Did Not Finish（途中棄権） |
| `DNS` | Did Not Start（未出走） |
| `DSQ` | Disqualified（失格） |
| `TOV` | Time Over（制限時間超過） |
| `OPEN` | オープン参加（順位なし） |
| `SKIP` | スイムスキップ（バイク+ランのみ参加） |

### data.json の構造

```json
{
  "events": [{
    "id": "yokohama",
    "name": "横浜トライアスロン",
    "editions": [{
      "date": "2025-05-18",
      "weather": { ... },
      "categories": [{
        "id": "yokohama",
        "distance": "OD",
        "segments": [
          { "sport": "swim", "distance_km": 1.5 },
          { "sport": "bike", "distance_km": 40 },
          { "sport": "run", "distance_km": 10 }
        ],
        "athletes": [{
          "rank": 1,
          "status": "finished",
          "name": "橋本 悠輝",
          "gender": "M",
          "residence": "JP-14",
          "total_time_seconds": 7361,
          "segments": [
            { "lap_seconds": 1325, "rank": 11 },
            { "lap_seconds": 3887, "rank": 1, "transition_seconds": 85 },
            { "lap_seconds": 2064, "rank": 2 }
          ]
        }]
      }]
    }]
  }]
}
```

## 開発環境のセットアップ

```bash
bun install
```

`bun install` を実行すると、Husky による Git pre-commit hook が自動的にセットアップされます。

## Lint / Format

[Biome](https://biomejs.dev/) を使って JSON・JS ファイルの lint とフォーマットを行います。

```bash
bun run check    # lint + format を一括実行・自動修正
bun run format   # フォーマットのみ
bun run lint     # lint のみ
```

### Pre-commit hook

コミット時に Biome がステージされたファイルを自動で lint + format します（Husky 経由）。
lint エラーがある場合はコミットがブロックされます。

## ビルド

TSV データから正規化 JSON を生成します。

```bash
bun run build
```

`dist/data.json` が生成され、`result-schema.json` に対して自動バリデーションが実行されます。

### dist/data.json について

`dist/data.json` は `.gitignore` に含まれており、**リポジトリには含まれていません**。

- **ローカルで使う場合**: `bun run build` を実行して生成してください。
- **CI (GitHub Actions)**: `master/` や `race-info.json` が変更されると `build-data.yml` が自動実行され、生成した `dist/data.json` を main ブランチへ自動コミットします。

## テストの実行

JSON ファイルの整合性を確認するテストを実行できます。

```bash
bun run test
```

GitHub Actions でも同じテストが自動的に実行され、JSON の構文エラーがないか確認されます。

`race-info.json` に記載された画像やリザルト、天気データのファイルが存在するかどうかも併せてチェックしています。

### 天気データの検証

天気データ（`master/*/*/weather-data.json`）は、`weather-schema.json` で定義された JSON Schema に基づいて自動検証されます。GitHub Actions の「Validate Weather Data」ワークフローが天気データファイルやスキーマファイルが変更されるたびに実行され、データの整合性を確認します。

## ライセンス / License

このリポジトリに含まれるデータおよびスクリプトは、すべて [Creative Commons 表示-改変禁止 4.0 国際 (CC BY-ND 4.0)](https://creativecommons.org/licenses/by-nd/4.0/deed.ja) の下で公開されています。
利用する際は、出所の明記をお願いします。データやコードを改変したものの配布は許可されていません。
