# Weather Data Policy

> weather-data.json is required for ALL races incl. overseas IRONMAN — no JP-only rule; Open-Meteo ERA5 for non-JP, JMA for JP; beware timezone=auto DST bug

天気データは海外大会（IRONMAN 等）にも必ず入れる。「海外は除外」というルールは存在しない（2026-07-15 ユーザー明示訂正: 既存 IRONMAN ディレクトリに weather-data.json が無かったのは単なる未整備で、規約ではない）。

**Why:** リポジトリの目的はレース条件込みの正規化データ提供。天気は全大会共通の必須付帯データ。

**How to apply:**
- 新規大会取り込み時、国内外問わず weather-data.json を生成する。
- **ファイルの置き場所が参照そのもの**: ai-tri の importer は corpus が導出する `weather_file` 経由で weather を読む。`weather_file` はどこにも保存されず、`master/<id>/<YYYY-MM-DD>/weather-data.json` が存在する Edition にだけ付く（`scripts/lib/corpus.js` / `scripts/lib/layout.js` の `weatherPath`）。生成スクリプトの `--out` は必ずそのパスにする。master/ 配下の別の場所に置いたファイルは参照されず、`check:integrity` の layout finding（unexpected-file）になる。2026-07-15 には、ファイルはあるのに当時の大会定義ファイルから未参照だった 1,628 件が取り込み漏れした実例あり（修正: ee9675d）。この layout ではその種類の漏れは起きない。
- 日本国内 = JMA 官署の hourly_s1（`data.jma.go.jp/stats/etrn/view/hourly_s1.php?prec_no=&block_no=`、天気は img alt、湿度・気圧・視程あり）。
- 海外 = Open-Meteo ERA5 archive API（無料・キー不要）。visibility は無いので `"---"`、不快指数は温湿度から計算。
- **Open-Meteo の落とし穴**: `timezone=auto` は「リクエスト時点の UTC オフセット」を全日付に適用する（DST 跨ぎで1時間ズレ）。`timeformat=unixtime` で取得し Python zoneinfo で日付ごとに変換すること。
- 会場座標: Open-Meteo geocoding + 国コード検証。州名・国名クエリは誤ヒット（Utah→別州の Utah 等）するので手動表必須。巡回開催（70.3 Worlds、IRONMAN Canada の Penticton/Whistler 変遷）はエディション別座標。
- **生成スクリプト（2026-09-07 にリポジトリへ commit 済み。scratchpad で書き直さないこと）**:
  - 国内 = `scripts/gen-weather-jma.py --prec <prec_no> --block <block_no> --date <YYYY-MM-DD> --lat <lat> --lon <lon> --out <path>`
  - 海外 = `scripts/gen-weather-open-meteo.py --lat <lat> --lon <lon> --tz <IANA tz> --date <YYYY-MM-DD> --out <path>`
  - 既存ファイルとの整合が取れている規約（両スクリプトの docstring にも記載）: 海外は `pressure_msl`（`surface_pressure` ではない）と `wind_speed_unit=ms`、国内は JMA `hourly_s1` の**現地気圧**と、最高/最低気温は月別 `daily_s1` ページ（hourly は毎正時サンプルなので日最高/最低にならない）。
  - 既知の観測所 ID（prec_no/block_no）: 伊良湖 51/47653、河口湖 49/47640、相川 54/47602、新潟 54/47604、名古屋 51/47636。
  - 新しい大会を追加したら、**まず既存の同種ファイルを再生成して差分ゼロを確認**してから本番生成する（この方法で上記の規約を復元した）。
- 未整備残: 日付プレースホルダー(YYYY-01-01)の408エディション → 実開催日調査後に生成。関連 [mikatiming-csv-import](mikatiming-csv-import.md) [import-race-discovery](discovery.md)
