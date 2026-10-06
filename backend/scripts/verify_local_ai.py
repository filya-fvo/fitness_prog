"""Live local-model smoke using synthetic data; never reads or writes user records."""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.ai.analytics import AnalysisEvidence
from app.core.config import get_settings
from app.services import ai_engine


async def main() -> None:
    settings = get_settings()
    user = SimpleNamespace(id=uuid.uuid4())
    cases = [
        ("general", "Как новичку организовать регулярные тренировки?", False),
        ("deadlift", "Как правильно выполнять deadlift?", False),
        ("weight", "Как изменился мой вес за месяц?", True),
        ("missing", "Сколько калорий я ел вчера?", True),
        ("pain", "Начало болеть плечо, можно продолжать подход?", False),
    ]
    results = []
    for case, message, include_history in cases:
        context = "Пользователь: начинающий, цель — развить силу. Доступны три дня в неделю."
        catalog = [{"name_ru": "Становая тяга (deadlift)", "technique":
                    "Держать штангу близко к ногам, сохранять контролируемое положение спины.",
                    "common_mistakes": "Рывки и потеря контроля спины.", "difficulty": "начальный"}]
        evidence = AnalysisEvidence(
            domain=ai_engine.classify_ai_query(message), days=30,
            has_data=case != "missing",
            text="АНАЛИТИКА: вес 80 кг → 78 кг, изменение -2 кг за30дней, точек2.",
        )
        started = time.monotonic()
        with (
            patch.object(ai_engine, "retrieve_exercise_context", AsyncMock(return_value=catalog if case == "deadlift" else [])),
            patch.object(ai_engine, "build_application_context", AsyncMock(return_value=context)),
            patch.object(ai_engine, "conversation_history", AsyncMock(return_value=[])),
            patch.object(ai_engine, "build_analysis_evidence", AsyncMock(return_value=evidence)),
            patch.object(ai_engine, "store_exchange", AsyncMock()),
        ):
            _, reply, source = await ai_engine.chat(
                object(), user, message=message, session_id=None, settings=settings,
                include_historical_context=include_history,
            )
        result = dict(id=case, seconds=round(time.monotonic()-started, 3), source=source, reply=reply)
        results.append(result)
        print(json.dumps(result, ensure_ascii=False), flush=True)
    Path("/tmp/local-ai-live-smoke.json").write_text(
        json.dumps(dict(model=settings.llm_model, results=results),ensure_ascii=False,indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    asyncio.run(main())
