# Multi-Sport Race Result Data

マルチスポーツ（トライアスロン、デュアスロン、アクアスロン等）のレースマスタとリザルトデータです。

このレポジトリの役割は、**汚い TSV データを正規化された JSON データとしてアプリケーションへ提供すること**です。

このレポジトリに入っているレースの結果を[AI TRI+](https://ai-triathlon-result.teraren.com/)のサイトで分析できるようになっています。

[![JSON Syntax Check](https://github.com/matsubo/triathlon-result-data/actions/workflows/json-check.yml/badge.svg)](https://github.com/matsubo/triathlon-result-data/actions/workflows/json-check.yml)
[![Validate Race Info](https://github.com/matsubo/triathlon-result-data/actions/workflows/validate-race-info.yml/badge.svg)](https://github.com/matsubo/triathlon-result-data/actions/workflows/validate-race-info.yml)
[![Validate Weather Data](https://github.com/matsubo/triathlon-result-data/actions/workflows/validate-weather-data.yml/badge.svg)](https://github.com/matsubo/triathlon-result-data/actions/workflows/validate-weather-data.yml)


## データ構造

以下のツリー構造になっています。

- 大会
  - 大会の開催日・天気
    - カテゴリ
      - リザルト（結果）

- 大会
  - `race-info.json`
  - 一番大元となるファイルです。
  - モデル名: `Event`
- 大会の開催日
  - その日に開催された内容。日をまたぐ場合は開始日を入力。
  - 天気情報の入力
    - 過去の天気は[このサイト](https://tenki.jp/past/2025/04/weather/)を参考に取得する。
    - 地点が少ないので近い都市を選ぶ。
  - モデル名: `Edition`
- カテゴリ
  - モデル名: `Category`
  - 普通は1つの大会で1つの競技が行われますがトライアスロンや競技中に競技内容が変更になった場合に使います。
  - 分析ページではカテゴリごとに結果を比較するので比較する前提が異なる場合に対応するためです。
  - `segments` 配列で競技構成を定義します（例: `[{sport:"swim", distance:1.5}, {sport:"bike", distance:40}, {sport:"run", distance:10}]`）
  - トライアスロン以外にもデュアスロン、アクアスロン、マラソンなどマルチスポーツに対応しています。
- リザルト
  - モデル名: `Result`
  - タイムが書かれたシートです


## 大会マスタを追加する方法

`race-info.json` を編集してください。

## 開催日の追加


### 天気情報の追加

レース日、レース場所の天気情報をjson形式で用意してください。

`master/<year>/<slug>/weather-data.json` 

過去の天気をWeb上で探して、スクショを撮ってサンプルのデータを添付しつつAIに投げれば作れます。

天気データは `weather-schema.json` で定義されたJSON Schemaに従って作成してください。GitHub Actionsで自動的にスキーマ検証が実行されます。


## リザルトを掲載する方法

方法1: 掲載してほしいリザルトがある場合はissueに追加してください。
ベストエフォートで対応します。

方法2: リザルトのデータをTSVファイルとして追加してpull requestを送ってほしいです。そうしましたら結構すぐに掲載できます。
（おすすめ）
（そのうちドキュメントを用意します。）

### リザルトの追加方法

#### レースマスタの編集
まずは、`race-info.json` を開いてください。
レース、レース開催日と距離のセットのツリー構造になっています。

すでにレースが存在していたら、レースカテゴリだけを追加してください。

####  大会画像の追加(存在していなければ)

`images/` ディレクトリに横400px, 縦300px程度の大会を象徴するような画像を保存してください。
フォーマットはwebpです。背景として利用するのでやや抽象的な荒いほうが良いです。

#### リザルトのファイルの追加

以下の場所へリザルトをTSV形式で追加してください。

`master/<year>/<slug>/result.tsv` 

(後方互換のために今はこうなっていますが、今後変更予定)

ヘッダ名などは元のリザルトデータを使ってもらってOKです。
取り込む際に調整します。

## アプリケーション向け：正規化データの利用

`bun run build` を実行すると、TSV + race-info.json + 天気データから正規化された JSON が生成されます。

```
dist/
├── result-schema.json   # 出力データの JSON Schema
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

`dist/data.json` が生成され、`dist/result-schema.json` に対して自動バリデーションが実行されます。

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
