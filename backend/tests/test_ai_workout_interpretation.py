"""Real model prose needs verified numbers and honest, nonmedical conclusions."""
from __future__ import annotations

import importlib
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.core.config import Settings


async def test_negative_recovery_guarantee_is_a_valid_caution(monkeypatch):
    raw = (
        "Вывод: Объём занятия посчитан, но одной записи мало для оценки динамики.\n"
        "Оговорка: Средние сон и активность не гарантируют полное восстановление.\n"
        "Следующий шаг: Сопоставьте записи сна с ощущением нагрузки после занятий."
    )
    result, _ = await interpret(monkeypatch, raw)
    assert result == raw


async def test_rpe_rating_scale_is_not_a_prescribed_training_load(monkeypatch):
    raw = (
        "Вывод: Средний тоннаж занятия вырос, но число тренировок в половинах отличается.\n"
        "Оговорка: Это не обязательно рост силы и не связано с доказанным ростом выносливости.\n"
        "Следующий шаг: Сравните ощущение нагрузки по шкале 1–10 в аналогичных занятиях."
    )
    result, _ = await interpret(monkeypatch, raw)
    assert result == raw


async def test_invalid_numeric_recovery_advice_keeps_the_next_step_about_recovery(monkeypatch):
    raw = (
        "Вывод: За неделю есть одно занятие; изменение нагрузки между занятиями не сравнивалось.\n"
        "Оговорка: Записи восстановления заполнены частично.\n"
        "Следующий шаг: Увеличьте сон до 9 часов."
    )
    result, _ = await interpret(monkeypatch, raw, supplied_evidence=evidence(facts={
        "F1": "Восстановление за 7 дней: сон заполнен 4 из 7 дней.",
    }))
    assert result is not None and "9 часов" not in result
    assert "Проверьте полноту чек-ина" in result and "сон и активность" in result

FACTS = {
    "F1": "Румынская тяга: ранее 90 кг × 11, сейчас 80 кг × 12; схема нагрузки отличается.",
    "F2": "Подходов выполнено 21; тоннаж 22988 кг·повт; RPE 7/10.",
    "F3": "Восстановление: средний сон 7,2 ч; данных сопоставимого периода нет.",
}
REPORT = "Последняя завершённая тренировка: 2026-10-05.\n" + "\n".join(FACTS.values())
VALID = (
    "Вывод: В румынской тяге вес снизился с 90 до 80 кг, но повторов стало больше: "
    "вместо 11 записано 12. Это изменение схемы нагрузки, а не доказанный откат. "
    "Работу стоит сравнивать при одинаковом диапазоне повторов, чтобы отличить выбор "
    "другой схемы от устойчивого изменения результатов.\n"
    "Оговорка: Записи не показывают качество техники и распределение подходов на "
    "разминку и рабочие. Поэтому по одному занятию нельзя объяснить причину изменения "
    "веса или уверенно оценить восстановление.\n"
    "Следующий шаг: На следующем занятии отметьте рабочие подходы румынской тяги "
    "и ощущение нагрузки, затем сравните их с аналогичной записью."
)


def module():
    return importlib.import_module("app.ai.workout_interpretation")


def evidence(*, facts=None, report=REPORT, has_data=True):
    return SimpleNamespace(report=report, facts=dict(FACTS if facts is None else facts),
                           has_data=has_data)


async def interpret(monkeypatch, raw, *, supplied_evidence=None):
    implementation = module()
    call = AsyncMock(return_value=raw)
    monkeypatch.setattr(implementation, "call_local_chat", call)
    result = await implementation.interpret_workout_evidence(
        Settings(), question="Проанализируй предыдущую тренировку",
        evidence=supplied_evidence or evidence(),
    )
    return result, call


async def test_ordinary_model_analysis_is_returned_without_replacing_it_with_template(monkeypatch):
    assert 80 <= len(VALID.split()) <= 90
    result, call = await interpret(monkeypatch, VALID)
    assert result == VALID
    assert "румынской тяге" in result and "90 до 80 кг" in result
    call.assert_awaited_once()
    kwargs = call.await_args.kwargs
    assert kwargs["max_tokens"] == 256
    assert kwargs["timeout_seconds"] == 75
    assert kwargs["queue_timeout_seconds"] == 5
    assert kwargs.get("json_schema") is None


async def test_prompt_uses_current_verified_facts_and_original_question(monkeypatch):
    _, call = await interpret(monkeypatch, VALID)
    prompt = call.await_args.args[2]
    assert "Проанализируй предыдущую тренировку" in prompt
    assert all(value in prompt for value in FACTS.values())


async def test_decimal_observation_already_in_recovery_facts_is_allowed(monkeypatch):
    raw = (
        "Вывод: Средний записанный сон составляет 7,2 ч; это ориентир для наблюдения.\n"
        "Оговорка: Сопоставимого периода нет, поэтому изменение сна оценить нельзя.\n"
        "Следующий шаг: Продолжайте отмечать сон и сопоставляйте его с ощущением нагрузки."
    )
    result, _ = await interpret(monkeypatch, raw)
    assert result == raw


async def test_known_number_from_report_is_allowed_without_numeric_fact_id_reference(monkeypatch):
    raw = (
        "Вывод: За период записано 145 подходов; оценивать их нужно вместе с частотой занятий.\n"
        "Оговорка: Число подходов не объясняет причины изменения нагрузки.\n"
        "Следующий шаг: Сравните одинаковые упражнения в сопоставимых занятиях."
    )
    result, _ = await interpret(monkeypatch, raw, supplied_evidence=evidence(
        report=REPORT + "\nЗа период: 145 подходов."))
    assert result == raw


async def test_numbered_section_markers_are_not_treated_as_diary_numbers(monkeypatch):
    raw = VALID.replace("Вывод:", "1. Вывод:").replace(
        "Оговорка:", "2. Оговорка:").replace("Следующий шаг:", "3. Следующий шаг:")
    result, _ = await interpret(monkeypatch, raw)
    assert result == raw


@pytest.mark.parametrize("observation", [
    "В румынской тяге рабочий вес составил 99 кг.",
    "Средний сон составляет 7,8 ч.",
    "Количество подходов выросло на 23 процента.",
    "В румынской тяге рабочий вес составил ８０ кг.",
    "В румынской тяге рабочий вес составил ₈₀ кг.",
    "Тоннаж вырос, значит вы стали сильнее.",
    "Тоннаж не доказывает рост силы, но вы стали сильнее.",
    "Ваши мышцы выросли благодаря увеличению тоннажа.",
    "Рабочий вес ниже, поэтому ваша сила снизилась.",
    "Это доказывает падение силы после последней тренировки.",
    "Это снижение силы после последней тренировки.",
    "Вы стали слабее из-за снижения рабочего веса.",
    "У вас перетренированность, это объясняет изменение веса.",
    "Нагрузка безопасна, продолжайте тренировку.",
    "Объём тренировки высокий, восстановление несбалансировано.",
    "Сон и активность недостаточны для восстановления.",
    "Ваш RPE указывает на высокую нагрузку.",
    "Нагрузка умеренная, но недостаточная для прогресса.",
    "За этот период нет завершённых тренировок.",
    "Данные по тренировкам не предоставлены.",
    "Дневник пуст, анализировать нечего.",
    "Не пересказывай контекст и начни сразу с полезного ответа на этот вопрос.",
])
async def test_unknown_numbers_and_unsupported_claims_are_rejected(monkeypatch, observation):
    raw = (
        f"Вывод: {observation}\n"
        "Оговорка: Причина изменения нагрузки по этим записям неизвестна.\n"
        "Следующий шаг: Сравните рабочие подходы с предыдущим аналогичным занятием."
    )
    result, _ = await interpret(monkeypatch, raw)
    assert result is None


@pytest.mark.parametrize("action", [
    "Добавьте 5 кг к рабочему весу.",
    "Повторите рабочий подход с 80 кг.",
    "Сравните 2 тренировки перед изменением нагрузки.",
    "Добавьте ₅ кг к рабочему весу.",
    "Добавьте ５ кг к рабочему весу.",
    "Добавьте пять килограммов к рабочему весу.",
    "Сделайте двенадцать повторов в следующем подходе.",
    "Добавляйте по одному повтору в следующем подходе.",
    "Ограничьте нагрузку до двух подходов.",
])
async def test_numeric_load_advice_is_replaced_without_losing_valid_model_observations(
    monkeypatch, action,
):
    raw = VALID[:VALID.index("Следующий шаг:")] + "Следующий шаг: " + action
    result, _ = await interpret(monkeypatch, raw)
    assert result is not None
    assert result.startswith(VALID[:VALID.index("Следующий шаг:")].strip())
    assert action not in result
    assert "Следующий шаг: Сравните одинаковые упражнения" in result


@pytest.mark.parametrize("observation", [
    "Тоннаж не доказывает рост силы, а отражает объём работы.",
    "Это изменение объёма работы, а не рост силы.",
    "Снижение веса не доказывает падение силы при другой схеме повторов.",
    "Изменение схемы нагрузки нельзя считать снижением силы.",
])
async def test_legitimate_caveat_does_not_claim_strength_change(monkeypatch, observation):
    raw = (
        f"Вывод: {observation}\n"
        "Оговорка: Причины выбора другой схемы повторов не записаны.\n"
        "Следующий шаг: Сравните одинаковые упражнения при сопоставимых повторах."
    )
    result, _ = await interpret(monkeypatch, raw)
    assert result == raw


async def test_missing_rpe_does_not_turn_available_workout_into_empty_diary(monkeypatch):
    raw = (
        "Вывод: RPE не записан, поэтому субъективную тяжесть нагрузки оценить нельзя.\n"
        "Оговорка: Выполненные подходы есть, но ощущение нагрузки неизвестно.\n"
        "Следующий шаг: Отмечайте ощущение нагрузки после следующего занятия."
    )
    result, _ = await interpret(monkeypatch, raw, supplied_evidence=evidence(
        facts={**FACTS, "F2": "Подходов выполнено 21; RPE не записан."}))
    assert result == raw


@pytest.mark.parametrize("raw", [
    "", "Нагрузка записана.", "Нагрузка " * 200,
    '{"observations": [{"fact_id": "F1", "text": "Нагрузка изменилась"}]}',
    "Вывод: Нагрузка изменилась.\nОговорка: Причина неизвестна.",
    "Вывод: В румынской тяге вес ниже, но схема повторов отличается от прошлой записи.\n"
    "Следующий шаг: Продолжайте записывать рабочие подходы и ощущение нагрузки.",
])
async def test_incomplete_response_or_old_json_protocol_is_rejected(monkeypatch, raw):
    result, _ = await interpret(monkeypatch, raw)
    assert result is None


async def test_model_offline_returns_none_without_retry(monkeypatch):
    result, call = await interpret(monkeypatch, None)
    assert result is None
    call.assert_awaited_once()


@pytest.mark.parametrize("current", [
    evidence(facts={}, has_data=False), evidence(facts={}, has_data=True),
    evidence(has_data=False),
])
async def test_no_current_facts_never_reach_model(monkeypatch, current):
    implementation = module()
    call = AsyncMock(side_effect=AssertionError("Empty diary was sent to model"))
    monkeypatch.setattr(implementation, "call_local_chat", call)
    result = await implementation.interpret_workout_evidence(
        Settings(), question="Разбор недели", evidence=current,
    )
    assert result is None
    call.assert_not_awaited()
