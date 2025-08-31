#!/usr/bin/env ruby
# frozen_string_literal: true
#
# command example
# % curl 'https://results.jtu.or.jp/api/results?cond%5Bresult_table_id%5D=3663' | ruby  bin/triathlon_result_to_tsv.rb > master/2025/uminomorisptri/result.tsv
#

require 'json'
require 'csv'

# 半角カタカナを全角カタカナに変換する
def convert_halfwidth_to_fullwidth_katakana(text)
  return text unless text.is_a?(String)
  
  # 半角カタカナから全角カタカナへの変換テーブル
  conversion_table = {
    'ｱ' => 'ア', 'ｲ' => 'イ', 'ｳ' => 'ウ', 'ｴ' => 'エ', 'ｵ' => 'オ',
    'ｶ' => 'カ', 'ｷ' => 'キ', 'ｸ' => 'ク', 'ｹ' => 'ケ', 'ｺ' => 'コ',
    'ｻ' => 'サ', 'ｼ' => 'シ', 'ｽ' => 'ス', 'ｾ' => 'セ', 'ｿ' => 'ソ',
    'ﾀ' => 'タ', 'ﾁ' => 'チ', 'ﾂ' => 'ツ', 'ﾃ' => 'テ', 'ﾄ' => 'ト',
    'ﾅ' => 'ナ', 'ﾆ' => 'ニ', 'ﾇ' => 'ヌ', 'ﾈ' => 'ネ', 'ﾉ' => 'ノ',
    'ﾊ' => 'ハ', 'ﾋ' => 'ヒ', 'ﾌ' => 'フ', 'ﾍ' => 'ヘ', 'ﾎ' => 'ホ',
    'ﾏ' => 'マ', 'ﾐ' => 'ミ', 'ﾑ' => 'ム', 'ﾒ' => 'メ', 'ﾓ' => 'モ',
    'ﾔ' => 'ヤ', 'ﾕ' => 'ユ', 'ﾖ' => 'ヨ',
    'ﾗ' => 'ラ', 'ﾘ' => 'リ', 'ﾙ' => 'ル', 'ﾚ' => 'レ', 'ﾛ' => 'ロ',
    'ﾜ' => 'ワ', 'ｦ' => 'ヲ', 'ﾝ' => 'ン',
    'ｧ' => 'ァ', 'ｨ' => 'ィ', 'ｩ' => 'ゥ', 'ｪ' => 'ェ', 'ｫ' => 'ォ',
    'ｬ' => 'ャ', 'ｭ' => 'ュ', 'ｮ' => 'ョ', 'ｯ' => 'ッ',
    'ｰ' => 'ー', '･' => '・'
  }
  
  # 濁点・半濁点の処理
  text = text.gsub(/([ｶ-ｺｻ-ｿﾀ-ﾄﾊ-ﾎ])ﾞ/) do |match|
    base_char = match[0]
    case base_char
    when 'ｶ' then 'ガ'
    when 'ｷ' then 'ギ'
    when 'ｸ' then 'グ'
    when 'ｹ' then 'ゲ'
    when 'ｺ' then 'ゴ'
    when 'ｻ' then 'ザ'
    when 'ｼ' then 'ジ'
    when 'ｽ' then 'ズ'
    when 'ｾ' then 'ゼ'
    when 'ｿ' then 'ゾ'
    when 'ﾀ' then 'ダ'
    when 'ﾁ' then 'ヂ'
    when 'ﾂ' then 'ヅ'
    when 'ﾃ' then 'デ'
    when 'ﾄ' then 'ド'
    when 'ﾊ' then 'バ'
    when 'ﾋ' then 'ビ'
    when 'ﾌ' then 'ブ'
    when 'ﾍ' then 'ベ'
    when 'ﾎ' then 'ボ'
    else match
    end
  end
  
  # 半濁点の処理
  text = text.gsub(/([ﾊ-ﾎ])ﾟ/) do |match|
    base_char = match[0]
    case base_char
    when 'ﾊ' then 'パ'
    when 'ﾋ' then 'ピ'
    when 'ﾌ' then 'プ'
    when 'ﾍ' then 'ペ'
    when 'ﾎ' then 'ポ'
    else match
    end
  end
  
  # 基本的な半角カタカナの変換
  conversion_table.each do |halfwidth, fullwidth|
    text = text.gsub(halfwidth, fullwidth)
  end
  
  text
end

# 標準入力からJSONデータを読み込む
def load_json_from_stdin
  input = STDIN.read
  if input.strip.empty?
    warn "エラー: 標準入力からデータが読み込めませんでした。"
    exit(1)
  end
  JSON.parse(input)
rescue JSON::ParserError => e
  warn "エラー: JSONの解析に失敗しました。詳細: #{e.message}"
  exit(1)
end

# JSONデータをCSVに変換して標準出力に表示する
def json_to_csv(json_data)
  # レスポンスデータの構造を確認
  res = json_data['res']
  unless res
    warn "エラー: JSONデータに 'res' が見つかりません。"
    exit(1)
  end

  body = res['body']
  unless body
    warn "エラー: JSONデータに 'res.body' が見つかりません。"
    exit(1)
  end

  # カラム情報を取得
  result_cols = body['result_cols']
  unless result_cols
    warn "エラー: JSONデータに 'result_cols' が見つかりません。"
    exit(1)
  end

  # 結果データを取得
  result_list = body['result_list']
  unless result_list
    warn "エラー: JSONデータに 'result_list' が見つかりません。"
    exit(1)
  end

  # ヘッダーを作成（カラムの順序に従って）
  headers = result_cols.sort_by { |col| col['result_col_order'] }
                      .map { |col| convert_halfwidth_to_fullwidth_katakana(col['result_col_caption']) }

  # TSVを標準出力に書き込む
  CSV($stdout, col_sep: "\t") do |tsv|
    tsv << headers
    
    result_list.each do |row|
      # col_1, col_2, ... の順にデータを取得
      row_values = []
      result_cols.sort_by { |col| col['result_col_order'] }.each_with_index do |col, index|
        col_key = "col_#{col['result_col_order']}"
        row_values << row[col_key]
      end
      tsv << row_values
    end
  end
end

# メイン処理
json_data = load_json_from_stdin
json_to_csv(json_data)
