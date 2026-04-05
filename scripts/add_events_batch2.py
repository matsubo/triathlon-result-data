#!/usr/bin/env python3
"""Script to add 6 new events to race-info.json: showa_kinen, kurashiki, nagasaki_saikai, osakikamijima, iyoshi, ako_tri"""

import json
import sys

RACE_INFO_PATH = "/Users/matsu/ghq/github.com/matsubo/triathlon-result-data/race-info.json"

# Helper to build standard OD segments with half-width kana headers (mspo.jp style)
def od_segments_halfwidth():
    return [
        {
            "sport": "swim",
            "distance": 1.5,
            "columns": [
                {"header": "ｽｲﾑﾗｯﾌﾟ", "role": "lap"},
                {"header": "S順", "role": "rank"}
            ]
        },
        {
            "sport": "bike",
            "distance": 40,
            "columns": [
                {"header": "ﾊﾞｲｸﾗｯﾌﾟ", "role": "lap"},
                {"header": "B順", "role": "rank"},
                {"header": "ｽﾌﾟﾘｯﾄ", "role": "cumulative_time"},
                {"header": "通過", "role": "cumulative_rank"}
            ]
        },
        {
            "sport": "run",
            "distance": 10,
            "columns": [
                {"header": "ﾗﾝﾗｯﾌﾟ", "role": "lap"},
                {"header": "R順", "role": "rank"}
            ]
        }
    ]

def od_meta_standard():
    """Standard meta_columns for OD races with 順位/No./氏名/年齢/性別/居住地/総合記録/男女順位/年齢区分"""
    return [
        {"header": "順位", "role": "overall_rank"},
        {"header": "No.", "role": "bib"},
        {"header": "氏名", "role": "name"},
        {"header": "年齢", "role": "age"},
        {"header": "性別", "role": "gender"},
        {"header": "居住地", "role": "residence"},
        {"header": "総合記録", "role": "total_time"},
        {"header": "男女順位", "role": "gender_rank"},
        {"header": "年齢区分", "role": "age_category"}
    ]

# ============================================================
# 1. showa_kinen (昭和記念公園トライアスロン)
# ============================================================

def showa_kinen_segments_2016_2018():
    """SS distance segments, half-width kana headers, with T1 in swim"""
    return [
        {
            "sport": "swim",
            "distance": 0.3,
            "columns": [
                {"header": "ｽｲﾑﾗｯﾌﾟ", "role": "lap"},
                {"header": "Ｓ順", "role": "rank"}
            ]
        },
        {
            "sport": "bike",
            "distance": 12,
            "columns": [
                {"header": "ﾊﾞｲｸﾗｯﾌﾟ", "role": "lap"},
                {"header": "Ｂ順", "role": "rank"},
                {"header": "ｽﾌﾟﾘｯﾄ", "role": "cumulative_time"},
                {"header": "通過", "role": "cumulative_rank"}
            ]
        },
        {
            "sport": "run",
            "distance": 3,
            "columns": [
                {"header": "ﾗﾝﾗｯﾌﾟ", "role": "lap"},
                {"header": "Ｒ順", "role": "rank"}
            ]
        }
    ]

def showa_kinen_meta_2016_2018():
    """17-col format: 総合 順位\tNo.\t氏名\t年齢\t性別\t居住地\t総合記録\tｽｲﾑﾗｯﾌﾟ\tＳ順\tﾊﾞｲｸﾗｯﾌﾟ\tＢ順\tｽﾌﾟﾘｯﾄ\t通過\tﾗﾝﾗｯﾌﾟ\tＲ順\t区分\t区分 別順"""
    return [
        {"header": "総合 順位", "role": "overall_rank"},
        {"header": "No.", "role": "bib"},
        {"header": "氏名", "role": "name"},
        {"header": "年齢", "role": "age"},
        {"header": "性別", "role": "gender"},
        {"header": "居住地", "role": "residence"},
        {"header": "総合記録", "role": "total_time"},
        {"header": "区分", "role": "age_category"},
        {"header": "区分 別順", "role": "age_rank"}
    ]

def showa_kinen_segments_2019():
    """2019: SD-ish, full-width kana, no gender/age/residence in this file"""
    return [
        {
            "sport": "swim",
            "distance": 0.75,
            "columns": [
                {"header": "スイムラップ", "role": "lap"},
                {"header": "Ｓ順", "role": "rank"}
            ]
        },
        {
            "sport": "bike",
            "distance": 20,
            "columns": [
                {"header": "バイクラップ", "role": "lap"},
                {"header": "Ｂ順", "role": "rank"},
                {"header": "スプリット", "role": "cumulative_time"},
                {"header": "通過", "role": "cumulative_rank"}
            ]
        },
        {
            "sport": "run",
            "distance": 5,
            "columns": [
                {"header": "ランラップ", "role": "lap"},
                {"header": "Ｒ順", "role": "rank"}
            ]
        }
    ]

def showa_kinen_meta_2019():
    """14-col format: 総合 順位\tNo.\t氏名\t総合記録\tスイムラップ\tＳ順\tバイクラップ\tＢ順\tスプリット\t通過\tランラップ\tＲ順\t年齢区分\t年齡 別順"""
    return [
        {"header": "総合 順位", "role": "overall_rank"},
        {"header": "No.", "role": "bib"},
        {"header": "氏名", "role": "name"},
        {"header": "総合記録", "role": "total_time"},
        {"header": "年齢区分", "role": "age_category"},
        {"header": "年齡 別順", "role": "age_rank"}
    ]

def build_showa_kinen_edition(year, date, men_tsv, women_tsv, segments_fn, meta_fn, distance, desc_suffix):
    return {
        "date": date,
        "weather_file": f"master/{year}/showa_kinen/weather-data.json",
        "categories": [
            {
                "id": "showa_kinen_men",
                "result_tsv": men_tsv,
                "name": "男子",
                "distance": distance,
                "description": f"{year}年昭和記念公園トライアスロン男子{desc_suffix}。東京都立川市の昭和記念公園を舞台に開催されるトライアスロン大会。",
                "segments": segments_fn(),
                "meta_columns": meta_fn()
            },
            {
                "id": "showa_kinen_women",
                "result_tsv": women_tsv,
                "name": "女子",
                "distance": distance,
                "description": f"{year}年昭和記念公園トライアスロン女子{desc_suffix}。東京都立川市の昭和記念公園を舞台に開催されるトライアスロン大会。",
                "segments": segments_fn(),
                "meta_columns": meta_fn()
            }
        ]
    }

showa_kinen = {
    "id": "showa_kinen",
    "name": "昭和記念公園トライアスロン",
    "location": "東京都立川市昭和記念公園",
    "image": "images/showa_kinen.webp",
    "source": "https://www.mspo.jp/showakinen-tri/",
    "editions": [
        build_showa_kinen_edition(
            2019, "2019-07-28",
            "master/2019/showa_kinen/result_men.tsv",
            "master/2019/showa_kinen/result_women.tsv",
            showa_kinen_segments_2019, showa_kinen_meta_2019, "SD", ""
        ),
        build_showa_kinen_edition(
            2018, "2018-07-22",
            "master/2018/showa_kinen/result_men.tsv",
            "master/2018/showa_kinen/result_women.tsv",
            showa_kinen_segments_2016_2018, showa_kinen_meta_2016_2018, "SS", ""
        ),
        build_showa_kinen_edition(
            2017, "2017-07-23",
            "master/2017/showa_kinen/result_men.tsv",
            "master/2017/showa_kinen/result_women.tsv",
            showa_kinen_segments_2016_2018, showa_kinen_meta_2016_2018, "SS", ""
        ),
        build_showa_kinen_edition(
            2016, "2016-07-24",
            "master/2016/showa_kinen/result_men.tsv",
            "master/2016/showa_kinen/result_women.tsv",
            showa_kinen_segments_2016_2018, showa_kinen_meta_2016_2018, "SS", ""
        ),
    ]
}

# ============================================================
# 2. kurashiki (倉敷国際トライアスロン大会)
# ============================================================
# Headers: 順位\tNo.\t氏名\t年齢\t性別\t居住地\t総合記録\tｽｲﾑﾗｯﾌﾟ\tS順\tﾊﾞｲｸﾗｯﾌﾟ\tB順\tｽﾌﾟﾘｯﾄ\t通過\tﾗﾝﾗｯﾌﾟ\tR順\t男女順位\t年齢区分
# 17 cols

def kurashiki_segments():
    return [
        {
            "sport": "swim",
            "distance": 1.5,
            "columns": [
                {"header": "ｽｲﾑﾗｯﾌﾟ", "role": "lap"},
                {"header": "S順", "role": "rank"}
            ]
        },
        {
            "sport": "bike",
            "distance": 40,
            "columns": [
                {"header": "ﾊﾞｲｸﾗｯﾌﾟ", "role": "lap"},
                {"header": "B順", "role": "rank"},
                {"header": "ｽﾌﾟﾘｯﾄ", "role": "cumulative_time"},
                {"header": "通過", "role": "cumulative_rank"}
            ]
        },
        {
            "sport": "run",
            "distance": 10,
            "columns": [
                {"header": "ﾗﾝﾗｯﾌﾟ", "role": "lap"},
                {"header": "R順", "role": "rank"}
            ]
        }
    ]

def kurashiki_meta():
    return [
        {"header": "順位", "role": "overall_rank"},
        {"header": "No.", "role": "bib"},
        {"header": "氏名", "role": "name"},
        {"header": "年齢", "role": "age"},
        {"header": "性別", "role": "gender"},
        {"header": "居住地", "role": "residence"},
        {"header": "総合記録", "role": "total_time"},
        {"header": "男女順位", "role": "gender_rank"},
        {"header": "年齢区分", "role": "age_category"}
    ]

def build_kurashiki_edition(year, date):
    return {
        "date": date,
        "weather_file": f"master/{year}/kurashiki/weather-data.json",
        "categories": [
            {
                "id": "kurashiki",
                "result_tsv": f"master/{year}/kurashiki/result.tsv",
                "name": "一般",
                "distance": "OD",
                "description": f"{year}年倉敷国際トライアスロン大会。岡山県倉敷市を舞台に、スイム1.5km、バイク40km、ラン10kmのオリンピックディスタンスで開催。",
                "segments": kurashiki_segments(),
                "meta_columns": kurashiki_meta()
            }
        ]
    }

kurashiki = {
    "id": "kurashiki",
    "name": "倉敷国際トライアスロン大会",
    "location": "岡山県倉敷市",
    "image": "images/kurashiki.webp",
    "source": "https://www.mspo.jp/kurashiki-triathlon/",
    "editions": [
        build_kurashiki_edition(2023, "2023-05-21"),
        build_kurashiki_edition(2019, "2019-05-26"),
        build_kurashiki_edition(2016, "2016-05-22"),
        build_kurashiki_edition(2015, "2015-05-24"),
        build_kurashiki_edition(2014, "2014-05-25"),
    ]
}

# ============================================================
# 3. nagasaki_saikai (長崎西海トライアスロン祭)
# ============================================================
# Headers: 総合順位\t男女順位\tNo.\t氏名\t年齢\t居住地\t性別\tカテゴリ\t総合記録\tｽｲﾑﾗｯﾌﾟ\tS順\tﾊﾞｲｸﾗｯﾌﾟ\tB順\tｽﾌﾟﾘｯﾄ\t通過\tﾗﾝﾗｯﾌﾟ\tR順\t年齢区分
# 18 cols

def nagasaki_saikai_segments():
    return [
        {
            "sport": "swim",
            "distance": 1.5,
            "columns": [
                {"header": "ｽｲﾑﾗｯﾌﾟ", "role": "lap"},
                {"header": "S順", "role": "rank"}
            ]
        },
        {
            "sport": "bike",
            "distance": 40,
            "columns": [
                {"header": "ﾊﾞｲｸﾗｯﾌﾟ", "role": "lap"},
                {"header": "B順", "role": "rank"},
                {"header": "ｽﾌﾟﾘｯﾄ", "role": "cumulative_time"},
                {"header": "通過", "role": "cumulative_rank"}
            ]
        },
        {
            "sport": "run",
            "distance": 10,
            "columns": [
                {"header": "ﾗﾝﾗｯﾌﾟ", "role": "lap"},
                {"header": "R順", "role": "rank"}
            ]
        }
    ]

def nagasaki_saikai_meta():
    return [
        {"header": "総合順位", "role": "overall_rank"},
        {"header": "男女順位", "role": "gender_rank"},
        {"header": "No.", "role": "bib"},
        {"header": "氏名", "role": "name"},
        {"header": "年齢", "role": "age"},
        {"header": "居住地", "role": "residence"},
        {"header": "性別", "role": "gender"},
        {"header": "カテゴリ", "role": "age_category"},
        {"header": "総合記録", "role": "total_time"},
        {"header": "年齢区分", "role": "age_category"}
    ]

def build_nagasaki_saikai_edition(year, date):
    return {
        "date": date,
        "weather_file": f"master/{year}/nagasaki_saikai/weather-data.json",
        "categories": [
            {
                "id": "nagasaki_saikai",
                "result_tsv": f"master/{year}/nagasaki_saikai/result.tsv",
                "name": "一般",
                "distance": "OD",
                "description": f"{year}年長崎西海トライアスロン祭。長崎県西海市を舞台に、スイム1.5km、バイク40km、ラン10kmのオリンピックディスタンスで開催。",
                "segments": nagasaki_saikai_segments(),
                "meta_columns": nagasaki_saikai_meta()
            }
        ]
    }

nagasaki_saikai = {
    "id": "nagasaki_saikai",
    "name": "長崎西海トライアスロン祭",
    "location": "長崎県西海市",
    "image": "images/nagasaki_saikai.webp",
    "source": "https://nagasakisaikai.com/",
    "editions": [
        build_nagasaki_saikai_edition(2019, "2019-11-03"),
        build_nagasaki_saikai_edition(2018, "2018-11-04"),
        build_nagasaki_saikai_edition(2017, "2017-11-05"),
        build_nagasaki_saikai_edition(2016, "2016-10-30"),
        build_nagasaki_saikai_edition(2015, "2015-11-01"),
        build_nagasaki_saikai_edition(2014, "2014-11-02"),
    ]
}

# ============================================================
# 4. osakikamijima (大崎上島HAPPYトライアスロン大会)
# ============================================================

def osakikamijima_segments_2016():
    """2016: 11 cols - Swimラップ, バイクラップ, ランラップ (full-width kana)"""
    return [
        {
            "sport": "swim",
            "distance": 1.5,
            "columns": [
                {"header": "Swimラップ", "role": "lap"}
            ]
        },
        {
            "sport": "bike",
            "distance": 40,
            "columns": [
                {"header": "バイクラップ", "role": "lap"}
            ]
        },
        {
            "sport": "run",
            "distance": 10,
            "columns": [
                {"header": "ランラップ", "role": "lap"}
            ]
        }
    ]

def osakikamijima_meta_2016():
    """2016: 総合順位\tNo.\t氏名\t居住地\t性別\t年齢区分\tSwimラップ\tバイクラップ\tランラップ\t合計タイム\t年代別順位"""
    return [
        {"header": "総合順位", "role": "overall_rank"},
        {"header": "No.", "role": "bib"},
        {"header": "氏名", "role": "name"},
        {"header": "居住地", "role": "residence"},
        {"header": "性別", "role": "gender"},
        {"header": "年齢区分", "role": "age_category"},
        {"header": "合計タイム", "role": "total_time"},
        {"header": "年代別順位", "role": "age_rank"}
    ]

def osakikamijima_segments_2017_2018():
    """2017-2018: 10 cols - same sport cols as 2016"""
    return osakikamijima_segments_2016()

def osakikamijima_meta_2017_2018():
    """2017-2018: 総合順位\tNo.\t氏名\t性別\t年齢区分\t合計タイム\tSwimラップ\tバイクラップ\tランラップ\t年代別順位"""
    return [
        {"header": "総合順位", "role": "overall_rank"},
        {"header": "No.", "role": "bib"},
        {"header": "氏名", "role": "name"},
        {"header": "性別", "role": "gender"},
        {"header": "年齢区分", "role": "age_category"},
        {"header": "合計タイム", "role": "total_time"},
        {"header": "年代別順位", "role": "age_rank"}
    ]

def osakikamijima_segments_2019_2022():
    """2019/2022: 14 cols - more split data"""
    return [
        {
            "sport": "swim",
            "distance": 1.5,
            "columns": [
                {"header": "Swimラップ", "role": "lap"},
                {"header": "S順", "role": "rank"}
            ]
        },
        {
            "sport": "bike",
            "distance": 40,
            "columns": [
                {"header": "バイクラップ", "role": "lap"},
                {"header": "B順", "role": "rank"},
                {"header": "通過", "role": "cumulative_rank"}
            ]
        },
        {
            "sport": "run",
            "distance": 10,
            "columns": [
                {"header": "ランラップ", "role": "lap"},
                {"header": "R順", "role": "rank"}
            ]
        }
    ]

def osakikamijima_meta_2019_2022():
    """2019/2022: 総合順位\tNo.\t氏名\t性別\t年齢区分\t合計タイム\tSwimラップ\tS順\tバイクラップ\tB順\t通過\tランラップ\tR順\t年代別順位"""
    return [
        {"header": "総合順位", "role": "overall_rank"},
        {"header": "No.", "role": "bib"},
        {"header": "氏名", "role": "name"},
        {"header": "性別", "role": "gender"},
        {"header": "年齢区分", "role": "age_category"},
        {"header": "合計タイム", "role": "total_time"},
        {"header": "年代別順位", "role": "age_rank"}
    ]

def build_osakikamijima_edition(year, date, segments_fn, meta_fn):
    return {
        "date": date,
        "weather_file": f"master/{year}/osakikamijima/weather-data.json",
        "categories": [
            {
                "id": "osakikamijima",
                "result_tsv": f"master/{year}/osakikamijima/result.tsv",
                "name": "一般",
                "distance": "OD",
                "description": f"{year}年大崎上島HAPPYトライアスロン大会。広島県豊田郡大崎上島町を舞台に、スイム1.5km、バイク40km、ラン10kmのオリンピックディスタンスで開催。",
                "segments": segments_fn(),
                "meta_columns": meta_fn()
            }
        ]
    }

osakikamijima = {
    "id": "osakikamijima",
    "name": "大崎上島HAPPYトライアスロン大会",
    "location": "広島県豊田郡大崎上島町",
    "image": "images/osakikamijima.webp",
    "source": "https://osakikamijima-triathlon.jp/",
    "editions": [
        build_osakikamijima_edition(2022, "2022-09-04", osakikamijima_segments_2019_2022, osakikamijima_meta_2019_2022),
        build_osakikamijima_edition(2019, "2019-09-08", osakikamijima_segments_2019_2022, osakikamijima_meta_2019_2022),
        build_osakikamijima_edition(2018, "2018-09-02", osakikamijima_segments_2017_2018, osakikamijima_meta_2017_2018),
        build_osakikamijima_edition(2017, "2017-09-03", osakikamijima_segments_2017_2018, osakikamijima_meta_2017_2018),
        build_osakikamijima_edition(2016, "2016-09-04", osakikamijima_segments_2016, osakikamijima_meta_2016),
    ]
}

# ============================================================
# 5. iyoshi (伊予市トライアスロン大会inふたみ)
# ============================================================
# Headers: 順位\tNo.\t氏名\t年齢\t性別\t総合記録\tｽｲﾑﾗｯﾌﾟ\tS順\tT1(ﾐﾆﾗﾝ)\tﾊﾞｲｸﾗｯﾌﾟ\tB順\tｽﾌﾟﾘｯﾄ\t通過\tﾗﾝﾗｯﾌﾟ\tR順\t男子順位\t女子順位\t年齢区分\t区分別順
# 19 cols

def iyoshi_segments():
    return [
        {
            "sport": "swim",
            "distance": 1.5,
            "columns": [
                {"header": "ｽｲﾑﾗｯﾌﾟ", "role": "lap"},
                {"header": "S順", "role": "rank"},
                {"header": "T1(ﾐﾆﾗﾝ)", "role": "transition"}
            ]
        },
        {
            "sport": "bike",
            "distance": 40,
            "columns": [
                {"header": "ﾊﾞｲｸﾗｯﾌﾟ", "role": "lap"},
                {"header": "B順", "role": "rank"},
                {"header": "ｽﾌﾟﾘｯﾄ", "role": "cumulative_time"},
                {"header": "通過", "role": "cumulative_rank"}
            ]
        },
        {
            "sport": "run",
            "distance": 10,
            "columns": [
                {"header": "ﾗﾝﾗｯﾌﾟ", "role": "lap"},
                {"header": "R順", "role": "rank"}
            ]
        }
    ]

def iyoshi_meta():
    return [
        {"header": "順位", "role": "overall_rank"},
        {"header": "No.", "role": "bib"},
        {"header": "氏名", "role": "name"},
        {"header": "年齢", "role": "age"},
        {"header": "性別", "role": "gender"},
        {"header": "総合記録", "role": "total_time"},
        {"header": "男子順位", "role": "gender_rank"},
        {"header": "女子順位", "role": "gender_rank"},
        {"header": "年齢区分", "role": "age_category"},
        {"header": "区分別順", "role": "age_rank"}
    ]

def build_iyoshi_edition(year, date):
    return {
        "date": date,
        "weather_file": f"master/{year}/iyoshi/weather-data.json",
        "categories": [
            {
                "id": "iyoshi",
                "result_tsv": f"master/{year}/iyoshi/result.tsv",
                "name": "一般",
                "distance": "OD",
                "description": f"{year}年伊予市トライアスロン大会inふたみ。愛媛県伊予市双海を舞台に、スイム1.5km、T1ミニラン、バイク40km、ラン10kmで開催。",
                "segments": iyoshi_segments(),
                "meta_columns": iyoshi_meta()
            }
        ]
    }

iyoshi = {
    "id": "iyoshi",
    "name": "伊予市トライアスロン大会inふたみ",
    "location": "愛媛県伊予市双海",
    "image": "images/iyoshi.webp",
    "source": "https://www.iyo-triathlon-futami.com/",
    "editions": [
        build_iyoshi_edition(2025, "2025-10-05"),
        build_iyoshi_edition(2024, "2024-10-06"),
        build_iyoshi_edition(2023, "2023-10-01"),
        build_iyoshi_edition(2019, "2019-10-06"),
        build_iyoshi_edition(2018, "2018-10-07"),
        build_iyoshi_edition(2017, "2017-10-01"),
        build_iyoshi_edition(2016, "2016-10-02"),
        build_iyoshi_edition(2015, "2015-10-04"),
        build_iyoshi_edition(2014, "2014-10-05"),
    ]
}

# ============================================================
# 6. ako_tri (赤穂トライアスロン大会)
# ============================================================

# Each year has different column structure, so we define per year

def ako_tri_2015_segments():
    """9 cols: 順位\t№ｶｰﾄﾞ\t氏名\t年齢\t地区\tSWIM\tBIKE\tRUN\tﾌｨﾆｯｼｭﾀｲﾑ"""
    return [
        {"sport": "swim", "distance": 0.75, "columns": [{"header": "SWIM", "role": "lap"}]},
        {"sport": "bike", "distance": 20, "columns": [{"header": "BIKE", "role": "lap"}]},
        {"sport": "run", "distance": 5, "columns": [{"header": "RUN", "role": "lap"}]}
    ]

def ako_tri_2015_meta():
    return [
        {"header": "順位", "role": "overall_rank"},
        {"header": "№ｶｰﾄﾞ", "role": "bib"},
        {"header": "氏名", "role": "name"},
        {"header": "年齢", "role": "age"},
        {"header": "地区", "role": "residence"},
        {"header": "ﾌｨﾆｯｼｭﾀｲﾑ", "role": "total_time"}
    ]

def ako_tri_2016_segments():
    """9 cols: 順位\tNo.\t氏名\t年齢\t住所\tスイム\tバイク\tラン\t総合記録"""
    return [
        {"sport": "swim", "distance": 0.75, "columns": [{"header": "スイム", "role": "lap"}]},
        {"sport": "bike", "distance": 20, "columns": [{"header": "バイク", "role": "lap"}]},
        {"sport": "run", "distance": 5, "columns": [{"header": "ラン", "role": "lap"}]}
    ]

def ako_tri_2016_meta():
    return [
        {"header": "順位", "role": "overall_rank"},
        {"header": "No.", "role": "bib"},
        {"header": "氏名", "role": "name"},
        {"header": "年齢", "role": "age"},
        {"header": "住所", "role": "residence"},
        {"header": "総合記録", "role": "total_time"}
    ]

def ako_tri_2017_segments():
    """10 cols: 順位\tNo.カード\t氏名\t年齢\t住所\tスイム\tバイク\tラン\tフィニッシュ\t表彰"""
    return [
        {"sport": "swim", "distance": 0.75, "columns": [{"header": "スイム", "role": "lap"}]},
        {"sport": "bike", "distance": 20, "columns": [{"header": "バイク", "role": "lap"}]},
        {"sport": "run", "distance": 5, "columns": [{"header": "ラン", "role": "lap"}]}
    ]

def ako_tri_2017_meta():
    return [
        {"header": "順位", "role": "overall_rank"},
        {"header": "No.カード", "role": "bib"},
        {"header": "氏名", "role": "name"},
        {"header": "年齢", "role": "age"},
        {"header": "住所", "role": "residence"},
        {"header": "フィニッシュ", "role": "total_time"}
    ]

def ako_tri_2018_segments():
    """9 cols: 順位\tNo.\t総合記録\tスイム\tバイク\tラン\t氏名\tフリガナ\t年齢"""
    return [
        {"sport": "swim", "distance": 0.75, "columns": [{"header": "スイム", "role": "lap"}]},
        {"sport": "bike", "distance": 20, "columns": [{"header": "バイク", "role": "lap"}]},
        {"sport": "run", "distance": 5, "columns": [{"header": "ラン", "role": "lap"}]}
    ]

def ako_tri_2018_meta():
    return [
        {"header": "順位", "role": "overall_rank"},
        {"header": "No.", "role": "bib"},
        {"header": "総合記録", "role": "total_time"},
        {"header": "氏名", "role": "name"},
        {"header": "年齢", "role": "age"}
    ]

def ako_tri_2019_segments():
    """9 cols: 順位\tナンバー\t氏名\t年齢\t所属\t記録\tスイム記録\tバイク記録\tラン記録"""
    return [
        {"sport": "swim", "distance": 0.75, "columns": [{"header": "スイム記録", "role": "lap"}]},
        {"sport": "bike", "distance": 20, "columns": [{"header": "バイク記録", "role": "lap"}]},
        {"sport": "run", "distance": 5, "columns": [{"header": "ラン記録", "role": "lap"}]}
    ]

def ako_tri_2019_meta():
    return [
        {"header": "順位", "role": "overall_rank"},
        {"header": "ナンバー", "role": "bib"},
        {"header": "氏名", "role": "name"},
        {"header": "年齢", "role": "age"},
        {"header": "所属", "role": "residence"},
        {"header": "記録", "role": "total_time"}
    ]

def ako_tri_2020_segments():
    """9 cols: 順位\tNo.\t氏名\tチーム名\t年齢\t最終タイム\tスイム記録\tバイク記録\tラン記録"""
    return [
        {"sport": "swim", "distance": 0.75, "columns": [{"header": "スイム記録", "role": "lap"}]},
        {"sport": "bike", "distance": 20, "columns": [{"header": "バイク記録", "role": "lap"}]},
        {"sport": "run", "distance": 5, "columns": [{"header": "ラン記録", "role": "lap"}]}
    ]

def ako_tri_2020_meta():
    return [
        {"header": "順位", "role": "overall_rank"},
        {"header": "No.", "role": "bib"},
        {"header": "氏名", "role": "name"},
        {"header": "チーム名", "role": "residence"},
        {"header": "年齢", "role": "age"},
        {"header": "最終タイム", "role": "total_time"}
    ]

def ako_tri_2021_segments():
    """8 cols: 順位\tナンバー\t氏名\t年齢\t最終タイム\tスイム記録\tバイク記録\tラン記録"""
    return [
        {"sport": "swim", "distance": 0.75, "columns": [{"header": "スイム記録", "role": "lap"}]},
        {"sport": "bike", "distance": 20, "columns": [{"header": "バイク記録", "role": "lap"}]},
        {"sport": "run", "distance": 5, "columns": [{"header": "ラン記録", "role": "lap"}]}
    ]

def ako_tri_2021_meta():
    return [
        {"header": "順位", "role": "overall_rank"},
        {"header": "ナンバー", "role": "bib"},
        {"header": "氏名", "role": "name"},
        {"header": "年齢", "role": "age"},
        {"header": "最終タイム", "role": "total_time"}
    ]

def ako_tri_2022_segments():
    """10 cols: 順位\tNO\t氏名\tカナ\t年齢\t最終タイム\tスイム\tバイク\tラン\t表彰"""
    return [
        {"sport": "swim", "distance": 0.75, "columns": [{"header": "スイム", "role": "lap"}]},
        {"sport": "bike", "distance": 20, "columns": [{"header": "バイク", "role": "lap"}]},
        {"sport": "run", "distance": 5, "columns": [{"header": "ラン", "role": "lap"}]}
    ]

def ako_tri_2022_meta():
    return [
        {"header": "順位", "role": "overall_rank"},
        {"header": "NO", "role": "bib"},
        {"header": "氏名", "role": "name"},
        {"header": "年齢", "role": "age"},
        {"header": "最終タイム", "role": "total_time"}
    ]

def ako_tri_2023_segments():
    """9 cols: 順位\t氏名\tフリガナ\tNo.\t年齢\t総合記録\tスイム\tバイク\tラン"""
    return [
        {"sport": "swim", "distance": 0.75, "columns": [{"header": "スイム", "role": "lap"}]},
        {"sport": "bike", "distance": 20, "columns": [{"header": "バイク", "role": "lap"}]},
        {"sport": "run", "distance": 5, "columns": [{"header": "ラン", "role": "lap"}]}
    ]

def ako_tri_2023_meta():
    return [
        {"header": "順位", "role": "overall_rank"},
        {"header": "氏名", "role": "name"},
        {"header": "No.", "role": "bib"},
        {"header": "年齢", "role": "age"},
        {"header": "総合記録", "role": "total_time"}
    ]

def ako_tri_2025_segments():
    """9 cols: 順位\t氏名\tNo.\t年齢\t総合記録\tスイム\tバイク\tラン\t順位表示"""
    return [
        {"sport": "swim", "distance": 0.75, "columns": [{"header": "スイム", "role": "lap"}]},
        {"sport": "bike", "distance": 20, "columns": [{"header": "バイク", "role": "lap"}]},
        {"sport": "run", "distance": 5, "columns": [{"header": "ラン", "role": "lap"}]}
    ]

def ako_tri_2025_meta():
    return [
        {"header": "順位", "role": "overall_rank"},
        {"header": "氏名", "role": "name"},
        {"header": "No.", "role": "bib"},
        {"header": "年齢", "role": "age"},
        {"header": "総合記録", "role": "total_time"}
    ]

def build_ako_tri_edition(year, date, segments_fn, meta_fn):
    return {
        "date": date,
        "weather_file": f"master/{year}/ako_tri/weather-data.json",
        "categories": [
            {
                "id": "ako_tri",
                "result_tsv": f"master/{year}/ako_tri/result.tsv",
                "name": "一般",
                "distance": "SD",
                "description": f"{year}年赤穂トライアスロン大会。兵庫県赤穂市を舞台に、スイム0.75km、バイク20km、ラン5kmのスプリントディスタンスで開催。",
                "segments": segments_fn(),
                "meta_columns": meta_fn()
            }
        ]
    }

ako_tri = {
    "id": "ako_tri",
    "name": "赤穂トライアスロン大会",
    "location": "兵庫県赤穂市",
    "image": "images/ako_tri.webp",
    "source": "https://htj.gr.jp/",
    "editions": [
        build_ako_tri_edition(2025, "2025-09-28", ako_tri_2025_segments, ako_tri_2025_meta),
        build_ako_tri_edition(2023, "2023-09-24", ako_tri_2023_segments, ako_tri_2023_meta),
        build_ako_tri_edition(2022, "2022-09-25", ako_tri_2022_segments, ako_tri_2022_meta),
        build_ako_tri_edition(2021, "2021-09-26", ako_tri_2021_segments, ako_tri_2021_meta),
        build_ako_tri_edition(2020, "2020-09-27", ako_tri_2020_segments, ako_tri_2020_meta),
        build_ako_tri_edition(2019, "2019-09-22", ako_tri_2019_segments, ako_tri_2019_meta),
        build_ako_tri_edition(2018, "2018-09-23", ako_tri_2018_segments, ako_tri_2018_meta),
        build_ako_tri_edition(2017, "2017-09-24", ako_tri_2017_segments, ako_tri_2017_meta),
        build_ako_tri_edition(2016, "2016-09-25", ako_tri_2016_segments, ako_tri_2016_meta),
        build_ako_tri_edition(2015, "2015-09-27", ako_tri_2015_segments, ako_tri_2015_meta),
    ]
}

# ============================================================
# Merge into existing race-info.json
# ============================================================

new_events = [showa_kinen, kurashiki, nagasaki_saikai, osakikamijima, iyoshi, ako_tri]
new_ids = {e["id"] for e in new_events}

# Read latest file
with open(RACE_INFO_PATH, "r", encoding="utf-8") as f:
    data = json.load(f)

existing_ids = {e["id"] for e in data["events"]}
print("Current event count:", len(data["events"]))
print("Existing IDs:", sorted(existing_ids))

# Remove any existing events with same IDs (shouldn't happen, but be safe)
events = [e for e in data["events"] if e["id"] not in new_ids]
if len(events) != len(data["events"]):
    print(f"WARNING: Removed {len(data['events']) - len(events)} existing events with conflicting IDs")

# Append new events
events.extend(new_events)
data = {"events": events}

print(f"New event count: {len(data['events'])}")
print(f"Added events: {sorted(new_ids)}")

with open(RACE_INFO_PATH, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write("\n")

print("Done writing race-info.json")
