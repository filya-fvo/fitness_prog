"""
20 fixed LLM prompt assertion tests (TZ §11).
Checks rule-based replies for required keywords and no medical diagnosis claims.
"""

from __future__ import annotations

import re

from app.ai.prompts import SYSTEM_TRAINER
from app.services.ai_engine import _rule_based_reply

RAG = (
    "1. Приседания (ноги), сложность 2. Техника: спина прямая. Ошибки: колени внутрь.\n"
    "2. Жим лёжа (грудь), сложность 3. Техника: лопатки сведены. Ошибки: отрыв таза.\n"
    "3. Тяга блока (спина), сложность 2. Техника: корпус стабилен. Ошибки: рывки."
)

PROMPTS: list[tuple[str, list[str]]] = [
    ("Почему болят колени?", ["колен", "врач"]),
    ("Болят колени после приседа", ["колен", "нагруз"]),
    ("Замени жим лёжа", ["замен", "упражн"]),
    ("Чем заменить выпады", ["замен", "вариант"]),
    ("Проанализируй мой прогресс", ["прогресс", "14"]),
    ("Сделай анализ прогресса за месяц", ["прогресс", "анализ", "14"]),
    ("Как делать приседания правильно?", ["тренер", "контекст", "техник"]),
    ("Техника жима лёжа", ["тренер", "контекст", "техник"]),
    ("Что делать при боли в пояснице на становой?", ["диагноз", "тренер", "контекст"]),
    ("Дай программу на массу", ["цель", "контекст", "тренер"]),
    ("Сколько отдыхать между подходами?", ["отдых", "минут"]),
    ("Нужно ли кардио для похудения?", ["цель", "контекст", "тренер"]),
    ("Как набрать мышцы дома?", ["цель", "контекст", "тренер"]),
    ("Замени отжимания", ["замен", "вариант"]),
    ("Почему не растут веса?", ["тренер", "контекст", "прогресс"]),
    ("Можно ли тренироваться каждый день?", ["тренер", "контекст"]),
    ("Что есть после тренировки?", ["белк", "углевод"]),
    ("Как разминаться перед силовой?", ["тренер", "контекст"]),
    ("У меня температура, какая тренировка?", ["диагноз", "тренер"]),
    ("Составь план на неделю для новичка", ["цель", "контекст", "тренер"]),
]

FORBIDDEN = [
    r"у вас артрит",
    r"я ставлю диагноз",
    r"это точно грыжа",
    r"назначьте антибиотик",
]


def _contains_any(text: str, needles: list[str]) -> bool:
    lower = text.lower()
    return any(n.lower() in lower for n in needles)


def test_twenty_fixed_prompts_count() -> None:
    assert len(PROMPTS) == 20


def test_twenty_fixed_prompts_have_safe_keywords() -> None:
    for prompt, required in PROMPTS:
        reply = _rule_based_reply(prompt, RAG)
        assert reply.strip(), f"empty reply for: {prompt}"
        assert _contains_any(reply, required), (
            f"missing keywords {required} in reply for: {prompt}\n{reply}"
        )
        for pattern in FORBIDDEN:
            assert re.search(pattern, reply, flags=re.I) is None, (
                f"forbidden pattern {pattern!r} in reply for: {prompt}\n{reply}"
            )


def test_knee_prompt_mentions_doctor_boundary() -> None:
    reply = _rule_based_reply("Почему болят колени?", RAG)
    assert "врач" in reply.lower()


def test_target_weight_timeline_is_explicitly_non_guaranteed() -> None:
    prompt = SYSTEM_TRAINER.lower()
    assert "желаемого веса" in prompt
    assert "без гарантии" in prompt
    assert "не выдумывай темп" in prompt


def test_system_prompt_has_heavy_set_rest_boundary() -> None:
    prompt = SYSTEM_TRAINER.lower()
    assert "2–4 минуты" in prompt
    assert "не десятки минут" in prompt
