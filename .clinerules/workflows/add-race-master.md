# トライアスロン大会情報追加ワークフロー

このワークフローは、新しいトライアスロン大会の情報をレースマスタに追加する手順を定義します。

## 前提条件
- JTUのイベントページURLを持っている
- 追加する大会の基本情報（日付、場所、カテゴリ）を把握している

## 実行手順

### 1. レース情報の取得
```
web_fetchツールを使用してJTUのイベントページから情報を取得
URL: https://www.jtu.or.jp/result_program/?event_id={EVENT_ID}
```

### 2. race-info.jsonの構造確認
```
read_fileツールでrace-info.jsonを読み込み、既存のデータ構造を確認
```

### 3. ディレクトリ構造の作成
各カテゴリごとにディレクトリを作成：
```bash
mkdir -p master/{YEAR}/{RACE_ID}
mkdir -p master/{YEAR}/{RACE_ID}_sprint  # スプリントがある場合
```

### 4. race-info.jsonへのレース情報追加
replace_in_fileツールを使用して以下の情報を追加：
```json
{
  "id": "{race_id}",
  "name": "大会名",
  "location": "開催地",
  "image": "images/{race_id}.webp",
  "source": "公式サイトまたはJTUのURL",
  "editions": [
    {
      "date": "YYYY-MM-DD",
      "weather_file": "master/{YEAR}/{RACE_ID}/weather-data.json",
      "categories": [
        {
          "id": "{category_id}",
          "result_tsv": "master/{YEAR}/{RACE_ID}/result.tsv",
          "name": "カテゴリ名",
          "distance": "OD|SD|MD|LD",
          "swim_distance": 1.5,
          "bike_distance": 40,
          "run_distance": 10,
          "description": "説明文"
        }
      ]
    }
  ]
}
```

### 5. 天気データファイルの作成
weather-schema.jsonに準拠した形式でweather-data.jsonを作成：
```json
{
  "date": "YYYY年MM月DD日",
  "sunrise": "HH:MM",
  "sunset": "HH:MM",
  "minTemp": 17.2,
  "maxTemp": 23.5,
  "hourly": [
    {
      "time": "3",
      "weather": "晴れ|曇り|雨",
      "weatherIcon": "clear-day|cloudy|rain|clear-night",
      "temp": 17.8,
      "humidity": 82,
      "dewPoint": 14.6,
      "pressure": 1015.2,
      "pressureChange": "+0.3",
      "windDirection": "北東",
      "windSpeed": 2,
      "visibility": 18,
      "discomfortIndex": 65
    }
    // 3時間ごとに8レコード（3,6,9,12,15,18,21,24時）
  ]
}
```

### 6. 空のresult.tsvファイルの作成
各カテゴリのディレクトリに空のresult.tsvファイルを作成：
```bash
touch master/{YEAR}/{RACE_ID}/result.tsv
touch master/{YEAR}/{RACE_ID}_sprint/result.tsv  # スプリントがある場合
```

### 7. レース画像の準備
dummy.webpをコピーして適切な名前で保存：
```bash
cp images/dummy.webp images/{race_id}.webp
```

## チェックリスト
- [ ] レース情報をJTUのURLから取得
- [ ] race-info.jsonの既存構造を確認
- [ ] 必要なディレクトリを作成
- [ ] race-info.jsonにレース情報を追加（全カテゴリ）
- [ ] weather-data.jsonを作成（スキーマ準拠）
- [ ] 各カテゴリの空result.tsvファイルを作成
- [ ] レース画像（dummy.webp）をコピー

## 注意事項
- sourceには公式サイトのURLを使用。ない場合はJTUのイベントページURLを使用
- 天気データは必ずweather-schema.jsonのスキーマに準拠すること
- 距離の単位：
  - swim_distance: km
  - bike_distance: km  
  - run_distance: km
- distanceの値：
  - SS: スーパースプリント
  - SD: スプリント
  - OD: オリンピック/スタンダード
  - MD: ミドル
  - LD: ロング
  - DUATHLON: デュアスロン

## ファイル構造例
```
master/2025/chibacity/
  ├── weather-data.json
  └── result.tsv
master/2025/chibacity_sprint/
  └── result.tsv
images/
  └── chibacity.webp
