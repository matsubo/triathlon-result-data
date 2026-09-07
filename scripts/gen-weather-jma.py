#!/usr/bin/env python3
"""Generate a weather-data.json from JMA (気象庁) hourly observations.

Domestic (Japanese) races use JMA 官署 hourly_s1 pages, which carry the weather
symbol, humidity, pressure and visibility that weather-schema.json expects.
Overseas races use scripts/gen-weather-open-meteo.py instead.

JMA publishes the 天気 (weather symbol) column late — it is absent for dates in
the last few weeks, and some automated stations (e.g. 相川) never report it. When
the cell is empty, the condition is filled from Open-Meteo's WMO code for the
same hour and coordinates so the file does not end up as all-UNKNOWN; every
measured quantity still comes from JMA. Pass --no-fill-weather to disable.

Usage:
  python3 scripts/gen-weather-jma.py --prec 54 --block 47602 \
      --date 2026-09-06 --lat 38.0272 --lon 138.2394 \
      --out master/2026/sado/weather-data.json

Station codes are the prec_no / block_no pair from
https://www.data.jma.go.jp/stats/etrn/view/hourly_s1.php
"""
import argparse
import json
import math
import re
import urllib.request
from datetime import date as date_cls

HOURS = ["3", "6", "9", "12", "15", "18", "21", "24"]

WEATHER_CODES = [
    ("快晴", "CLEAR"), ("晴", "CLEAR"),
    ("薄曇", "CLOUDY"), ("曇", "CLOUDY"), ("煙霧", "FOG"),
    ("しゅう雨", "SHOWERS"), ("にわか雨", "SHOWERS"),
    ("大雨", "HEAVY_RAIN"), ("暴風雨", "STORM"), ("雷", "THUNDER"),
    ("霧雨", "RAIN"), ("雨", "RAIN"),
    ("みぞれ", "RAIN"), ("雪", "RAIN"),
    ("霧", "FOG"),
]

# WMO code -> schema enum, matching scripts/gen-weather-open-meteo.py
WMO = {
    0: "CLEAR", 1: "CLEAR", 2: "PARTLY_CLOUDY", 3: "CLOUDY",
    45: "FOG", 48: "FOG",
    51: "RAIN", 53: "RAIN", 55: "RAIN", 56: "RAIN", 57: "RAIN",
    61: "RAIN", 63: "RAIN", 65: "HEAVY_RAIN", 66: "RAIN", 67: "HEAVY_RAIN",
    71: "RAIN", 73: "RAIN", 75: "HEAVY_RAIN", 77: "RAIN",
    80: "SHOWERS", 81: "SHOWERS", 82: "HEAVY_RAIN",
    85: "SHOWERS", 86: "SHOWERS",
    95: "THUNDER", 96: "STORM", 99: "STORM",
}

WIND_DIRECTIONS = {
    "北": "N", "北北東": "NNE", "北東": "NE", "東北東": "ENE",
    "東": "E", "東南東": "ESE", "南東": "SE", "南南東": "SSE",
    "南": "S", "南南西": "SSW", "南西": "SW", "西南西": "WSW",
    "西": "W", "西北西": "WNW", "北西": "NW", "北北西": "NNW",
    "静穏": "CALM",
}


def fetch(page, prec, block, d):
    url = (
        f"https://www.data.jma.go.jp/stats/etrn/view/{page}.php"
        f"?prec_no={prec}&block_no={block}&year={d.year}&month={d.month}&day={d.day}&view="
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read().decode("utf-8", "replace")


def table_rows(html, width):
    """Rows of the JMA data table that have exactly `width` cells."""
    start = html.find("id='tablefix1'")
    if start < 0:
        raise SystemExit("JMA table not found — check prec_no/block_no")
    table = html[start : html.find("</table>", start)]
    out = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.S):
        cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S)
        if len(cells) != width:
            continue
        parsed = []
        for c in cells:
            alt = re.search(r'alt="([^"]*)"', c)
            parsed.append(alt.group(1) if alt else re.sub(r"<[^>]+>", "", c).replace("\u00a0", " ").strip())
        out.append(parsed)
    return out


def daily_extremes(prec, block, d):
    """Daily max/min temperature from the monthly daily_s1 page.

    The hourly page only samples on the hour, so its extremes are not the
    official daily extremes (which come from 10-minute data).
    """
    for row in table_rows(fetch("daily_s1", prec, block, d), 21):
        if row[0] == str(d.day):
            return num(row[7]), num(row[8])
    return None, None


def parse_rows(html):
    start = html.find("id='tablefix1'")
    if start < 0:
        raise SystemExit("JMA table not found — check prec_no/block_no")
    table = html[start : html.find("</table>", start)]
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.S):
        cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S)
        if len(cells) != 17:
            continue
        parsed = []
        for c in cells:
            alt = re.search(r'alt="([^"]*)"', c)
            parsed.append(alt.group(1) if alt else re.sub(r"<[^>]+>", "", c).replace(" ", " ").strip())
        rows.append(parsed)
    if not rows:
        raise SystemExit("no hourly rows parsed")
    return rows


def open_meteo_codes(lat, lon, d, tz):
    """{local hour: weatherCode} from Open-Meteo, to fill gaps in JMA's 天気."""
    url = (
        "https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={lat}&longitude={lon}&start_date={d}&end_date={d}"
        f"&hourly=weather_code&timezone={tz}"
    )
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as res:
            data = json.load(res)
        codes = data["hourly"]["weather_code"]
        times = data["hourly"]["time"]
    except Exception as exc:  # noqa: BLE001 - fallback is simply "no fill"
        print(f"  (weather fill unavailable: {exc})")
        return {}
    out = {}
    for t, c in zip(times, codes):
        if c is None:
            continue
        out[int(t[11:13])] = WMO.get(c, "UNKNOWN")
    return out


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def weather_code(text):
    for needle, code in WEATHER_CODES:
        if needle in text:
            return code
    return "UNKNOWN"


def discomfort_index(temp, humidity):
    if temp is None or humidity is None:
        return "---"
    return round(0.81 * temp + 0.01 * humidity * (0.99 * temp - 14.3) + 46.3)


def sun_times(lat, lon, d):
    """NOAA sunrise/sunset, returned as local JST HH:MM."""
    n = d.toordinal() - date_cls(2000, 1, 1).toordinal() + 0.0008
    out = []
    for is_sunset in (False, True):
        j_star = n - lon / 360.0
        m = math.radians((357.5291 + 0.98560028 * j_star) % 360)
        c = 1.9148 * math.sin(m) + 0.02 * math.sin(2 * m) + 0.0003 * math.sin(3 * m)
        lam = math.radians((math.degrees(m) + c + 180 + 102.9372) % 360)
        j_transit = 2451545.0 + j_star + 0.0053 * math.sin(m) - 0.0069 * math.sin(2 * lam)
        decl = math.asin(math.sin(lam) * math.sin(math.radians(23.4397)))
        cos_w = (math.sin(math.radians(-0.833)) - math.sin(math.radians(lat)) * math.sin(decl)) / (
            math.cos(math.radians(lat)) * math.cos(decl)
        )
        cos_w = max(-1.0, min(1.0, cos_w))
        w = math.degrees(math.acos(cos_w))
        j = j_transit + (w if is_sunset else -w) / 360.0
        minutes = round((j - 2451545.0 + 0.5) % 1 * 1440 + 9 * 60) % 1440  # UTC+9
        out.append(f"{minutes // 60:02d}:{minutes % 60:02d}")
    return out[0], out[1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prec", required=True)
    ap.add_argument("--block", required=True)
    ap.add_argument("--date", required=True)
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lon", type=float, required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--tz", default="Asia/Tokyo")
    ap.add_argument("--no-fill-weather", action="store_true")
    args = ap.parse_args()

    d = date_cls.fromisoformat(args.date)
    rows = table_rows(fetch("hourly_s1", args.prec, args.block, d), 17)
    if not rows:
        raise SystemExit("no hourly rows parsed")
    by_hour = {r[0]: r for r in rows}

    max_temp, min_temp = daily_extremes(args.prec, args.block, d)
    if max_temp is None or min_temp is None:
        temps = [num(r[4]) for r in rows if num(r[4]) is not None]
        max_temp, min_temp = max(temps), min(temps)
    sunrise, sunset = sun_times(args.lat, args.lon, d)

    fill = {} if args.no_fill_weather else open_meteo_codes(args.lat, args.lon, args.date, args.tz)
    filled = 0

    hourly = []
    prev_pressure = None
    for h in HOURS:
        r = by_hour.get(h)
        if r is None:
            continue
        temp, humidity = num(r[4]), num(r[7])
        code = weather_code(r[14])
        if code == "UNKNOWN" and not r[14].strip():
            hour_key = 0 if h == "24" else int(h)
            if hour_key in fill:
                code = fill[hour_key]
                filled += 1
        pressure = num(r[1])
        change = ""
        if pressure is not None and prev_pressure is not None:
            change = f"{pressure - prev_pressure:+.1f}"
        if pressure is not None:
            prev_pressure = pressure
        hourly.append(
            {
                "time": h,
                "weatherCode": code,
                "temp": temp,
                "humidity": int(humidity) if humidity is not None else 0,
                "dewPoint": num(r[5]),
                "pressure": pressure,
                "pressureChange": change,
                "windDirectionCode": WIND_DIRECTIONS.get(r[9], "UNKNOWN"),
                "windSpeed": num(r[8]),
                "visibility": num(r[16]) if num(r[16]) is not None else "---",
                "discomfortIndex": discomfort_index(temp, humidity),
            }
        )

    data = {
        "date": args.date,
        "sunrise": sunrise,
        "sunset": sunset,
        "minTemp": min_temp,
        "maxTemp": max_temp,
        "hourly": hourly,
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    note = f", {filled} weatherCode filled from Open-Meteo" if filled else ""
    print(f"wrote {args.out}: {len(hourly)} hourly entries, {data['minTemp']}–{data['maxTemp']}°C{note}")


if __name__ == "__main__":
    main()
