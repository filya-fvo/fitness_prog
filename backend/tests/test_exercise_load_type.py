"""Shared contract fixtures keep preparation eligibility equal to the web client."""
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services.exercise_load_type import infer_load_type

CASES = json.loads((Path(__file__).resolve().parents[2] / "contracts/workout-exercise-load-types.json").read_text(encoding="utf-8-sig"))


@pytest.mark.parametrize("case", CASES)
def test_load_type_matches_shared_contract(case):
    fields = {key: value for key, value in case.items() if key != "expected"}
    assert infer_load_type(SimpleNamespace(**fields)) == case["expected"]
