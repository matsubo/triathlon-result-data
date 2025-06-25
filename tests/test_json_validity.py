import json
from pathlib import Path
import pytest


def test_all_json_files_are_valid():
    repo_root = Path(__file__).resolve().parents[1]
    json_files = sorted(repo_root.rglob('*.json'))

    errors = []
    for path in json_files:
        try:
            with open(path, encoding='utf-8') as f:
                json.load(f)
        except Exception as exc:
            errors.append(f"{path}: {exc}")

    if errors:
        formatted = '\n'.join(errors)
        pytest.fail(f"Invalid JSON files found:\n{formatted}")


def test_race_info_paths_exist():
    repo_root = Path(__file__).resolve().parents[1]
    race_info = repo_root / "race-info.json"

    with open(race_info, encoding="utf-8") as f:
        info = json.load(f)

    missing = []
    for event in info.get("events", []):
        image = event.get("image")
        if image and not (repo_root / image).is_file():
            missing.append(image)

        for edition in event.get("editions", []):
            weather = edition.get("weather_file")
            if weather and not (repo_root / weather).is_file():
                missing.append(weather)

            for category in edition.get("categories", []):
                result = category.get("result_tsv")
                if result and not (repo_root / result).is_file():
                    missing.append(result)

    if missing:
        formatted = "\n".join(sorted(missing))
        pytest.fail(f"Missing files referenced in race-info.json:\n{formatted}")
