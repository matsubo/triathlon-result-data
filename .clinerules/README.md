# Triathlon result data

トライアスロンのレースマスタとリザルトデータです。

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

## テストの実行

`pytest` を使ってJSONファイルの整合性を確認するテストを実行できます。
レポジトリのルートで次のコマンドを実行してください。

```bash
pytest
```

GitHub Actions でも同じテストが自動的に実行され、JSONの構文エラーがないか確認
されます。

`race-info.json` に記載された画像やリザルト、天気データのファイルが存在するか
どうかも併せてチェックしています。

### 天気データの検証

天気データ（`master/*/*/weather-data.json`）は、`weather-schema.json` で定義されたJSON Schemaに基づいて自動検証されます。GitHub Actionsの「Validate Weather Data」ワークフローが天気データファイルやスキーマファイルが変更されるたびに実行され、データの整合性を確認します。



## formatter

race-info.jsonを整形するためには以下のコマンドを打ちます。

```
bun format
```
