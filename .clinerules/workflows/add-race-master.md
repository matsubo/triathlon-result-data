# トライアスロン大会情報追加ワークフロー

このワークフローは、新しいトライアスロン大会の情報をレースマスタ（`master/`）に追加する手順を定義します。

## 前提条件
- JTUのイベントページURLを持っている
- 追加する大会の基本情報（日付、場所、カテゴリ）を把握している

## ディレクトリ構成
```
master/{race_id}/event.json                        大会の情報（event-schema.json）
master/{race_id}/image.webp                        大会の画像（600x400のWebP、大会ごとに固有）
master/{race_id}/{YYYY-MM-DD}/edition.json         開催日のカテゴリ一覧（edition-schema.json）
master/{race_id}/{YYYY-MM-DD}/{category_id}.tsv    カテゴリのリザルト
master/{race_id}/{YYYY-MM-DD}/weather-data.json    開催日の天気（ある場合のみ）
```
パスはすべてこの構成から決まります。大会IDと開催日はディレクトリ名なので、JSONにはパスもIDも日付も書きません。

## 実行手順

### 1. レース情報の取得
```
web_fetchツールを使用してJTUのイベントページから情報を取得
URL: https://www.jtu.or.jp/result_program/?event_id={EVENT_ID}
```

### 2. 既存データの確認
同じ大会がすでに登録されていないか、大会IDと大会名の両方で確認します（IDが違っても同じ大会のことがあります）。
```bash
ls master/                                          # 大会ID（ディレクトリ名）の一覧
grep '"name"' master/*/event.json | grep '{大会名の一部}'
```
既存の大会の書き方は、read_fileツールで `master/{race_id}/event.json` と `master/{race_id}/{YYYY-MM-DD}/edition.json` を読んで確認します。

### 3. 大会画像の準備（新しい大会のみ）
大会を象徴する画像を `master/{race_id}/image.webp` に置きます。Importモジュールは image.webp がない新しい大会を受け付けないので、取り込みより先に置いてください。
- フォーマットはWebP、サイズは横600px・縦400px（リサイズ・切り抜きでちょうど600x400にする）
- 大会ごとに固有の画像にする。ほかの画像のコピーは使わない（Importモジュールは、ほかの大会の image.webp と同じ画像の新しい大会を受け付けません）
- 画像の出典は `event.json` の `image_source`（`url`・`author`・`license`）に記録する

画像の探し方・変換方法は `.claude/skills/import-race/references/image-policy.md` を参照してください。

### 4. 大会と開催日の追加（Importモジュール）
大会と開催日は Importモジュール（`bun scripts/import.js`）で追加します。インポートプラン（JSON）を書き、まず `--dry-run` で確認してから実行します。
```bash
bun scripts/import.js plan.json --dry-run
bun scripts/import.js plan.json
```
プランの例（新しい大会とJTUのリザルトの開催日）：
```json
{
  "events": [
    {
      "id": "{race_id}",
      "name": "大会名",
      "location": "開催地",
      "location_parts": { "country": "JP", "prefecture": "千葉県", "city": "千葉市" },
      "source": "公式サイトまたはJTUのURL",
      "image_source": { "url": "画像の元ページのURL", "author": "撮影者", "license": "CC BY-SA 4.0" }
    }
  ],
  "editions": [
    {
      "event": "{race_id}",
      "date": "YYYY-MM-DD",
      "jtu": [
        { "program": "NNN_N", "id": "{category_id}", "name": "カテゴリ名", "distance": "OD", "description": "説明文" }
      ]
    }
  ]
}
```
- 新しい大会は `events[]` に書きます。既存の大会は `editions[].event` に大会IDを書くだけです。
- JTUのカテゴリの `id`・`name` は、前回の開催日に同じ距離のカテゴリが1つだけあれば省略できます（そこから引き継ぎます）。新しい大会では指定してください。カテゴリIDがTSVのファイル名（`{category_id}.tsv`）になります。
- Importモジュールは開催日のディレクトリ `master/{race_id}/{YYYY-MM-DD}/`（カテゴリごとの `{category_id}.tsv` と `edition.json`）と、新しい大会なら `master/{race_id}/event.json` だけを書き込みます。ほかの大会は書き換えません。書き込むファイルはレポートの `written` に出ます。
- JTU以外のリザルト（PDF・CSVなど）は、TSVを用意して `prepared[]` で取り込みます。
- プランの書式は `scripts/lib/import-plan-schema.json`、詳しい手順は `.claude/skills/import-race/SKILL.md` を参照してください。

開催日の各カテゴリにはリザルトのTSVが必要です。リザルトがまだない開催日は追加できません（TSVのないカテゴリがあると `bun run test` が、開催日のない大会があると `bun run check:integrity` が失敗します）。

### 5. 天気データファイルの作成
Importモジュールは天気を書き込みません。取り込んだあとで `master/{race_id}/{YYYY-MM-DD}/weather-data.json` を作成します。このファイルがあれば、その開催日に天気があることになります（JSONに設定するフィールドはありません）。
```bash
# 国内（気象庁）
python3 scripts/gen-weather-jma.py --prec {prec_no} --block {block_no} \
    --date YYYY-MM-DD --lat {緯度} --lon {経度} \
    --out master/{race_id}/{YYYY-MM-DD}/weather-data.json
# 海外（Open-Meteo）
python3 scripts/gen-weather-open-meteo.py --lat {緯度} --lon {経度} \
    --tz {IANAタイムゾーン} --date YYYY-MM-DD \
    --out master/{race_id}/{YYYY-MM-DD}/weather-data.json
```
天気データは weather-schema.json のスキーマに準拠していることを `bun run test:weather` で確認します。

### 6. 整形と検証
```bash
bun run check             # JSONを Biome で整形
bun run test              # スキーマ検証、画像、TSV、master/ の構成（layout findings）
bun run check:integrity   # master/ の構成に問題（layout findings）があると失敗
```
`event.json`・`image.webp`・`edition.json` がない、どのカテゴリにも対応しないファイルがある、といった構成の問題は `bun run test` と `bun run check:integrity` で検出されます。

## チェックリスト
- [ ] レース情報をJTUのURLから取得
- [ ] 同じ大会がないことを大会IDと大会名で確認
- [ ] 大会ごとに固有の600x400のWebP画像を `master/{race_id}/image.webp` に配置し、出典を `image_source` に記録
- [ ] インポートプランを `--dry-run` で確認してから実行（全カテゴリ）
- [ ] weather-data.jsonを作成（スキーマ準拠）
- [ ] `bun run check`・`bun run test`・`bun run check:integrity` が通る

## 注意事項
- sourceには公式サイトのURLを使用。ない場合はJTUのイベントページURLを使用
- 天気データは必ずweather-schema.jsonのスキーマに準拠すること
- 距離の単位：各セグメントの `distance` は km
- distanceの値：
  - SS: スーパースプリント
  - SD: スプリント
  - OD: オリンピック/スタンダード
  - MD: ミドル
  - LD: ロング
  - DUATHLON: デュアスロン
- JSONは `bun run check`（Biome）で整形されます

## ファイル構造例
```
master/chibacity/
  ├── event.json
  ├── image.webp
  └── 2025-10-13/
        ├── edition.json
        ├── chibacity.tsv
        ├── chibacity_sprint.tsv
        └── weather-data.json
```
