"""Regressions observed while preparing the Qwen3.5 production replacement."""

from pathlib import Path
import json

import pytest

from app.core.config import Settings
from app.services import ai_engine, local_llm
from app.services.nutrition_label_vision import parse_ocr_text


@pytest.mark.parametrize(
    "message",
    [
        "Как сделать тренировку более эффективной?",
        "Можно ли выбрать более лёгкий вес?",
        "Как стать сильнее и делать больше повторений?",
    ],
)
def test_normal_words_do_not_trigger_pain_rules(message: str) -> None:
    assert ai_engine._requires_rule_only(message) is False


@pytest.mark.parametrize("message", [
    "Болит плечо", "Начало болеть колено", "Есть боль", "При болях в спине", "Есть боли",
])
def test_actual_pain_still_uses_rules(message: str) -> None:
    assert ai_engine._requires_rule_only(message) is True


def test_russian_answer_can_include_a_standard_english_exercise_name() -> None:
    reply = "Для deadlift уменьшите рабочий вес и проверьте технику."
    assert ai_engine._russian_only(reply) == reply


def test_relevant_application_fact_is_not_lost_in_a_short_context() -> None:
    fact = "Вес уменьшился с 80 до 78 кг за 30 дней."
    context = "Описание профиля. " * 40 + fact + " Данные питания. " * 40
    assert len(context) < 1500
    prompt = ai_engine._build_chat_prompt(
        message="Как изменилась масса тела?",
        app_context=context,
        catalog_context="",
        history=[],
    )
    assert fact in prompt


def test_conversation_keeps_more_than_a_single_short_exchange() -> None:
    history = [
        {"role": "user", "content": "Раньше я занимался два раза в неделю. " * 3},
        {"role": "assistant", "content": "Начните с двух занятий и оцените восстановление. " * 3},
        {"role": "user", "content": "Сейчас восстановление хорошее и я хочу три занятия. " * 3},
        {"role": "assistant", "content": "Добавьте третий день постепенно, сохраняя отдых. " * 3},
    ]
    prompt = ai_engine._build_chat_prompt(
        message="Как это лучше распределить?", app_context="", catalog_context="", history=history
    )
    assert all(item["content"].strip() in prompt for item in history)


async def test_trainer_receives_a_useful_configured_output_budget(monkeypatch) -> None:
    observed = {}

    async def fake_call(*_args, **kwargs):
        observed.update(kwargs)
        return "Полезный завершённый ответ на русском языке."

    monkeypatch.setattr(ai_engine, "call_local_chat", fake_call)
    await ai_engine._call_configured_ai(Settings(llm_max_output_tokens=256), "system", "question")
    assert observed["max_tokens"] == 256
    assert observed["queue_timeout_seconds"] >= 5


async def test_truncated_generation_is_not_accepted_as_a_completed_answer(monkeypatch) -> None:
    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"finish_reason": "length", "message": {"content": "Для начала"}}]}

    class Client:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, *_args, **_kwargs):
            return Response()

    monkeypatch.setattr(local_llm.httpx, "AsyncClient", Client)
    result = await local_llm.call_local_chat(
        Settings(llm_provider="local", llm_base_url="http://llm:8080/v1"), "system", "question"
    )
    assert result is None


@pytest.mark.parametrize("choices", [[], ["invalid"], [{"message": {"content": ["text"]}}]])
async def test_malformed_model_choices_use_fallback(monkeypatch, choices) -> None:
    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": choices}

    class Client:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, *_args, **_kwargs):
            return Response()

    monkeypatch.setattr(local_llm.httpx, "AsyncClient", Client)
    assert await local_llm.call_local_chat(
        Settings(llm_provider="local", llm_base_url="http://llm:8080/v1"), "system", "question"
    ) is None


CORPUS = Path(__file__).parent / "fixtures/nutrition_labels_20261006/manifest.json"
SAMPLES = json.loads(CORPUS.read_text(encoding="utf-8"))["samples"]


@pytest.mark.parametrize("sample", SAMPLES, ids=[sample["id"] for sample in SAMPLES])
def test_household_label_transcripts_match_the_reviewed_reference(sample: dict) -> None:
    actual = parse_ocr_text(sample["manual_nutrition_excerpt"]).model_dump()
    for field, expected in sample["expected"].items():
        if field not in sample["challenge_fields"]:
            assert actual[field] == expected, (sample["id"], field)


def test_ingredient_sugar_does_not_become_a_nutrition_number() -> None:
    result = parse_ocr_text(
        "Состав: сахар, какао 12%, мука.\n"
        "Пищевая ценность на 100 г: белки 4,7 г, жиры 24 г, углеводы 53,6 г.\n"
        "Энергетическая ценность 449 ккал."
    )
    assert result.sugars_g is None
