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
