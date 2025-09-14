# Weather Data Creation Rules

## Overview
When creating weather-data.json files for triathlon races, follow these rules to ensure compliance with the JSON schema validation.

## Required Fields
All weather-data.json files must include these top-level fields:
- `date`: Race date in Japanese format (e.g., "2025年9月14日")
- `sunrise`: Sunrise time in HH:MM format (e.g., "05:43")
- `sunset`: Sunset time in HH:MM format (e.g., "19:28")
- `minTemp`: Minimum temperature as a number (Celsius)
- `maxTemp`: Maximum temperature as a number (Celsius)
- `hourly`: Array of hourly weather data objects

## Hourly Data Requirements
Each object in the `hourly` array must contain:

### Required Fields:
- `time`: Hour as string (e.g., "3", "6", "9")
- `weather`: Weather condition in Japanese (e.g., "晴れ", "曇り", "雨")
- `weatherIcon`: **MUST be one of these exact values:**
  - `"rain"`
  - `"cloudy"`
  - `"clear"`
  - `"clear-night"`
  - `"clear-day"`
  - `"heavy-rain"`
  - `"partly-cloudy"`
- `temp`: Temperature as number (Celsius)
- `humidity`: Humidity as integer (0-100)
- `dewPoint`: Dew point temperature as number (Celsius)
- `pressure`: Atmospheric pressure as number (hPa)
- `pressureChange`: Pressure change as string with +/- prefix or empty string
- `windDirection`: Wind direction in Japanese (e.g., "南東", "北西")
- `windSpeed`: Wind speed as number (m/s, minimum 0)
- `visibility`: Either a number (km, minimum 0) OR the string "---"
- `discomfortIndex`: Either an integer (0-100) OR the string "---"

## Common Mistakes to Avoid

### ❌ WRONG weatherIcon values:
- `"sunny"` (use `"clear-day"` instead)
- `"sun"` (use `"clear-day"` instead)
- `"overcast"` (use `"cloudy"` instead)
- `"drizzle"` (use `"rain"` instead)

### ❌ WRONG data types:
- Using strings for numeric fields (temp, humidity, etc.)
- Using numbers for string fields (time, weather, etc.)
- Using floats for integer fields (humidity, discomfortIndex)

### ❌ WRONG value ranges:
- humidity outside 0-100 range
- negative windSpeed values
- discomfortIndex outside 0-100 range (when not "---")

## Validation Command
Before committing, always validate your weather data:
```bash
ajv validate -s weather-schema.json -d path/to/your/weather-data.json
```

## Example Valid Structure
```json
{
  "date": "2025年9月14日",
  "sunrise": "05:43",
  "sunset": "19:28",
  "minTemp": 25.4,
  "maxTemp": 33.5,
  "hourly": [
    {
      "time": "3",
      "weather": "晴れ",
      "weatherIcon": "clear-day",
      "temp": 26.7,
      "humidity": 89,
      "dewPoint": 24.7,
      "pressure": 1010.1,
      "pressureChange": "-0.1",
      "windDirection": "南東",
      "windSpeed": 2,
      "visibility": 12,
      "discomfortIndex": 77
    }
  ]
}
```

## Automated Validation
The repository has a GitHub Actions workflow that automatically validates all weather-data.json files. Any schema violations will cause the workflow to fail.
