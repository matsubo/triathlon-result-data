# Triathlon result data

トライアスロンのレースマスタとリザルトデータです。

このレポジトリに入っているレースの結果を[AI TRI+](https://ai-triathlon-result.teraren.com/)のサイトで分析できるようになっています。

[![CI](https://github.com/matsubo/triathlon-result-data/actions/workflows/ci.yml/badge.svg)](https://github.com/matsubo/triathlon-result-data/actions/workflows/ci.yml)


## データ構造

以下のツリー構造になっています。

- 大会
  - 大会の開催日・天気
    - カテゴリ
      - リザルト（結果）

`master/` の下に大会ごとのディレクトリがあり、その下に開催日ごとのディレクトリがあります。

```
master/<event_id>/event.json                      大会の情報
master/<event_id>/image.webp                      大会の画像（600x400のWebP）
master/<event_id>/<YYYY-MM-DD>/edition.json       開催日のカテゴリ一覧
master/<event_id>/<YYYY-MM-DD>/<category_id>.tsv  カテゴリのリザルト
master/<event_id>/<YYYY-MM-DD>/weather-data.json  開催日の天気（ある場合のみ）
```

パスはすべてこの構成から決まります。大会IDと開催日はディレクトリ名なので、JSONにはパスもIDも日付も書きません。

- 大会
  - `master/<event_id>/event.json`
  - 大会IDはディレクトリ名です。
  - スキーマ: `event-schema.json`
  - モデル名: `Event`
- 大会の開催日
  - `master/<event_id>/<YYYY-MM-DD>/edition.json`
  - その日に開催された内容。日をまたぐ場合は開始日を入力。開催日はディレクトリ名です。
  - 天気情報の入力
    - 過去の天気は[このサイト](https://tenki.jp/past/2025/04/weather/)を参考に取得する。
    - 地点が少ないので近い都市を選ぶ。
  - スキーマ: `edition-schema.json`
  - モデル名: `Edition`
- カテゴリ
  - モデル名: `Category`
  - `edition.json` の `categories` に定義します。
  - 普通は1つの大会で1つの競技が行われますがトライアスロンや競技中に競技内容が変更になった場合に使います。
  - 分析ページではカテゴリごとに結果を比較するので比較する前提が異なる場合に対応するためです。
- リザルト
  - モデル名: `Result`
  - タイムが書かれたシートです
  - `master/<event_id>/<YYYY-MM-DD>/<category_id>.tsv`（ファイル名はカテゴリIDと同じ）


## 大会マスタを追加する方法

`master/<event_id>/event.json` と大会の画像 `master/<event_id>/image.webp` を用意してください。
リザルトがある場合は、Importモジュール（`bun scripts/import.js`）で開催日と一緒に追加するのがおすすめです。
手順は `.clinerules/workflows/add-race-master.md` を参照してください。

## 開催日の追加

Importモジュール（`bun scripts/import.js`）で追加するのがおすすめです。
インポートプランを書いて、まず `--dry-run` で確認してから実行します。

```bash
bun scripts/import.js plan.json --dry-run
bun scripts/import.js plan.json
```

開催日のディレクトリ `master/<event_id>/<YYYY-MM-DD>/` に、カテゴリごとの `<category_id>.tsv` と `edition.json` が書き込まれます。ほかの大会のファイルは書き換えません。
プランの書式は `scripts/lib/import-plan-schema.json` を参照してください。

### 天気情報の追加

レース日、レース場所の天気情報をjson形式で用意してください。

`master/<event_id>/<YYYY-MM-DD>/weather-data.json`

このファイルがあれば、その開催日に天気があることになります（JSONに設定するフィールドはありません）。

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
まずは、対象の大会のディレクトリ `master/<event_id>/` を開いてください。
大会（`event.json`）、開催日ごとのディレクトリ（`<YYYY-MM-DD>/edition.json`）、カテゴリのツリー構造になっています。

すでにレースが存在していたら、開催日とカテゴリだけを追加してください。
Importモジュール（`bun scripts/import.js`）を使うと、開催日のディレクトリに `edition.json` とTSVをまとめて書き込めます。

####  大会画像の追加(存在していなければ)

`master/<event_id>/image.webp` に大会を象徴するような画像を保存してください。

- フォーマットはWebP、サイズは横600px, 縦400px です（リサイズ・切り抜きでちょうど600x400にしてください）。
- 大会ごとに固有の画像にしてください。ほかの画像のコピーは使えません（Importモジュールも、ほかの大会と同じ画像の新しい大会を受け付けません）。
- 画像の出典は、その大会の `event.json` の `image_source`（`url`・`author`・`license`）に記録してください。

背景として利用するのでやや抽象的な荒いほうが良いです。

#### リザルトのファイルの追加

以下の場所へリザルトをTSV形式で追加してください。

`master/<event_id>/<YYYY-MM-DD>/<category_id>.tsv`

ファイル名は `edition.json` に書いたカテゴリのID（英小文字・数字・`_`）と同じにしてください。

ヘッダ名などは元のリザルトデータを使ってもらってOKです。
取り込む際に調整します。

## テストの実行

`bun run test` でJSONファイルの整合性を確認するテストと型チェックを実行できます。
レポジトリのルートで次のコマンドを実行してください。

```bash
bun run test
```

GitHub Actions の CI ワークフロー（`.github/workflows/ci.yml`）でも、push と
pull request のたびに同じテストが自動的に実行され、JSONの構文エラーがないか確認
されます。

`event.json` は `event-schema.json`、`edition.json` は `edition-schema.json` で検証されます。
`master/` のディレクトリ構成もチェックしています。`event.json`・`image.webp`・`edition.json`
がない、開催日のない大会がある、どのカテゴリにも対応しないファイルがある、といった構成の問題
（layout findings）があると `bun run test` と `bun run check:integrity` が失敗します。
`edition.json` に書いたカテゴリのTSVがない場合も `bun run test` が失敗します。

```bash
bun run check:integrity
```

### 天気データの検証

天気データ（`master/<event_id>/<YYYY-MM-DD>/weather-data.json`）は、`weather-schema.json` で定義されたJSON Schemaに基づいて自動検証されます（`bun run test:weather`）。GitHub Actions の CI ワークフローが push と pull request のたびに実行し、データの整合性を確認します。



## formatter

`event.json`・`edition.json` などのJSONは `bun run check`（Biome）で整形されます。

```
bun run check
```
