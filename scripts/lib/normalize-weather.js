/**
 * Normalize weather objects coming from master/**\/weather-data.json so that
 * downstream i18n-aware consumers can translate values without string matching
 * Japanese. Adds machine-readable code fields alongside the original Japanese
 * display strings:
 *   - weatherCode:       one of CLEAR | CLEAR_DAY | CLEAR_NIGHT | PARTLY_CLOUDY
 *                        | CLOUDY | RAIN | HEAVY_RAIN | SHOWERS | THUNDER | FOG
 *                        | STORM | UNKNOWN
 *   - windDirectionCode: N | NNE | NE | ENE | E | ESE | SE | SSE | S | SSW | SW
 *                        | WSW | W | WNW | NW | NNW | CALM | UNKNOWN
 *   - dateISO:           the weather.date field converted from
 *                        "2018年4月22日" to "2018-04-22" where possible.
 *
 * Original fields are preserved to avoid breaking existing consumers.
 */

const WEATHER_TO_CODE = {
  晴れ: "CLEAR",
  快晴: "CLEAR",
  晴: "CLEAR",
  "晴れ時々曇り": "PARTLY_CLOUDY",
  晴時々曇: "PARTLY_CLOUDY",
  "晴れ時々くもり": "PARTLY_CLOUDY",
  薄曇: "PARTLY_CLOUDY",
  薄曇り: "PARTLY_CLOUDY",
  曇り: "CLOUDY",
  くもり: "CLOUDY",
  曇: "CLOUDY",
  雨: "RAIN",
  小雨: "RAIN",
  にわか雨: "SHOWERS",
  強い雨: "HEAVY_RAIN",
  大雨: "HEAVY_RAIN",
  暴風雨: "STORM",
  雷: "THUNDER",
  雷雨: "THUNDER",
  霧: "FOG",
  不明: "UNKNOWN",
  "---": "UNKNOWN",
  "": "UNKNOWN",
};

const WIND_DIRECTION_TO_CODE = {
  北: "N",
  北北東: "NNE",
  北東: "NE",
  東北東: "ENE",
  東: "E",
  東南東: "ESE",
  南東: "SE",
  南南東: "SSE",
  南: "S",
  南南西: "SSW",
  南西: "SW",
  西南西: "WSW",
  西: "W",
  西北西: "WNW",
  北西: "NW",
  北北西: "NNW",
  静穏: "CALM",
  無風: "CALM",
  "---": "UNKNOWN",
  "": "UNKNOWN",
};

/**
 * Convert "YYYY年M月D日" → "YYYY-MM-DD". Returns null if the string does not
 * match the expected Japanese format.
 */
export function parseWeatherDate(str) {
  if (!str || typeof str !== "string") return null;
  const m = str.trim().match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/**
 * Return a machine-readable code for a Japanese weather string.
 * Falls back to "UNKNOWN" so the field is always populated.
 */
export function weatherToCode(str) {
  if (str == null) return "UNKNOWN";
  const trimmed = String(str).trim();
  return WEATHER_TO_CODE[trimmed] ?? "UNKNOWN";
}

/**
 * Return a 16-point compass code for a Japanese wind direction string.
 */
export function windDirectionToCode(str) {
  if (str == null) return "UNKNOWN";
  const trimmed = String(str).trim();
  return WIND_DIRECTION_TO_CODE[trimmed] ?? "UNKNOWN";
}

/**
 * Produce a new weather object with normalized code fields added. Returns
 * null if the input is null/undefined. The input is not mutated.
 */
export function normalizeWeather(weather) {
  if (!weather || typeof weather !== "object") return weather ?? null;
  const hourly = Array.isArray(weather.hourly)
    ? weather.hourly.map((h) => ({
        ...h,
        weatherCode: weatherToCode(h?.weather),
        windDirectionCode: windDirectionToCode(h?.windDirection),
      }))
    : weather.hourly;
  const dateISO = parseWeatherDate(weather.date);
  return {
    ...weather,
    ...(dateISO ? { dateISO } : {}),
    hourly,
  };
}
