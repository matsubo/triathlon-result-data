#!/usr/bin/env python3
"""Generate a weather-data.json for an overseas race from Open-Meteo.

Pressure is sea-level (pressure_msl), matching the overseas editions already in
this repository; the JMA path records station-level pressure, matching its own.

Domestic (Japanese) races use scripts/gen-weather-jma.py instead; JMA carries
the weather symbol and visibility that Open-Meteo does not publish (visibility
is therefore recorded as "---", per weather-data-policy).

Usage:
  python3 scripts/gen-weather-open-meteo.py --lat 40.4093 --lon 49.8671 \
      --tz Asia/Baku --date 2026-09-05 \
      --out master/2026/im703_baku_2026/weather-data.json

Times are requested as unixtime and converted with zoneinfo per date: passing
timezone=auto makes Open-Meteo apply the UTC offset in effect at request time
to every date, which silently shifts data by an hour across a DST boundary.
"""
import argparse
import json
import urllib.request
from datetime import date as date_cls
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

HOURS = [3, 6, 9, 12, 15, 18, 21, 24]

HOURLY_VARS = "temperature_2m,relative_humidity_2m,dew_point_2m,pressure_msl,wind_speed_10m,wind_direction_10m,weather_code"
DAILY_VARS = "sunrise,sunset,temperature_2m_max,temperature_2m_min"

# ERA5 lags real time by several days, so recent races are only in the
# historical-forecast archive. Try the reanalysis first, then fall back.
ENDPOINTS = [
    "https://archive-api.open-meteo.com/v1/archive",
    "https://historical-forecast-api.open-meteo.com/v1/forecast",
]

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

COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
           "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.load(res)


def fetch(lat, lon, start, end):
    query = (
        f"?latitude={lat}&longitude={lon}&start_date={start}&end_date={end}"
        f"&hourly={HOURLY_VARS}&daily={DAILY_VARS}"
        "&wind_speed_unit=ms&timeformat=unixtime&timezone=UTC"
    )
    last = None
    for base in ENDPOINTS:
        data = get_json(base + query)
        temps = data.get("hourly", {}).get("temperature_2m") or []
        if any(t is not None for t in temps):
            return data, base
        last = base
    raise SystemExit(f"no data available from Open-Meteo (last tried {last})")


def compass(deg):
    if deg is None:
        return "UNKNOWN"
    return COMPASS[int((deg % 360) / 22.5 + 0.5) % 16]


def discomfort_index(temp, humidity):
    if temp is None or humidity is None:
        return "---"
    return round(0.81 * temp + 0.01 * humidity * (0.99 * temp - 14.3) + 46.3)


def rnd(v, n=1):
    return None if v is None else round(v, n)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lon", type=float, required=True)
    ap.add_argument("--tz", required=True, help="IANA timezone, e.g. Europe/Vienna")
    ap.add_argument("--date", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    tz = ZoneInfo(args.tz)
    d = date_cls.fromisoformat(args.date)
    # Widen the window by a day on each side so local hour 24 and the local
    # day boundary are both covered regardless of UTC offset.
    data, source = fetch(args.lat, args.lon, d - timedelta(days=1), d + timedelta(days=1))

    hourly = data["hourly"]
    by_local = {}
    for i, ts in enumerate(hourly["time"]):
        local = datetime.fromtimestamp(ts, tz)
        by_local[(local.date(), local.hour)] = i

    daily = data["daily"]
    day_idx = next(
        (i for i, ts in enumerate(daily["time"]) if datetime.fromtimestamp(ts, tz).date() == d),
        None,
    )
    if day_idx is None:
        raise SystemExit(f"{args.date} not present in the daily response")

    def local_hhmm(ts):
        return datetime.fromtimestamp(ts, tz).strftime("%H:%M")

    entries = []
    prev_pressure = None
    for h in HOURS:
        key = (d, 0) if h == 24 else (d, h)
        idx = by_local.get((d + timedelta(days=1), 0)) if h == 24 else by_local.get(key)
        if idx is None:
            continue
        temp = rnd(hourly["temperature_2m"][idx])
        humidity = hourly["relative_humidity_2m"][idx]
        pressure = rnd(hourly["pressure_msl"][idx])
        change = ""
        if pressure is not None and prev_pressure is not None:
            change = f"{pressure - prev_pressure:+.1f}"
        if pressure is not None:
            prev_pressure = pressure
        entries.append(
            {
                "time": str(h),
                "weatherCode": WMO.get(hourly["weather_code"][idx], "UNKNOWN"),
                "temp": temp,
                "humidity": int(humidity) if humidity is not None else 0,
                "dewPoint": rnd(hourly["dew_point_2m"][idx]),
                "pressure": pressure,
                "pressureChange": change,
                "windDirectionCode": compass(hourly["wind_direction_10m"][idx]),
                "windSpeed": rnd(hourly["wind_speed_10m"][idx]),
                "visibility": "---",
                "discomfortIndex": discomfort_index(temp, humidity),
            }
        )

    out = {
        "date": args.date,
        "sunrise": local_hhmm(daily["sunrise"][day_idx]),
        "sunset": local_hhmm(daily["sunset"][day_idx]),
        "minTemp": rnd(daily["temperature_2m_min"][day_idx]),
        "maxTemp": rnd(daily["temperature_2m_max"][day_idx]),
        "hourly": entries,
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"wrote {args.out}: {len(entries)} entries, {out['minTemp']}–{out['maxTemp']}°C, src={source.split('//')[1].split('.')[0]}")


if __name__ == "__main__":
    main()
