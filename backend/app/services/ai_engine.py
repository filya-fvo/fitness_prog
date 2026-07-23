"""Hybrid AI engine: rule-based + optional LLM + RAG (TZ §6)."""

from __future__ import annotations

import hashlib
import json
import time
import uuid
from datetime import date, timedelta
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.prompts import SYSTEM_TRAINER, build_user_context
from app.ai.rag import format_rag_block, retrieve_exercise_context
from app.core.config import Settings
from app.models.ai_conversation import AIConversation
from app.models.user import User
from app.models.workout import Workout

# simple in-process response cache: hash -> (expires_ts, payload)
_response_cache: dict[str, tuple[float, dict[str, Any]]] = {}
CACHE_TTL_SEC = 60 * 60 * 24


def _cache_get(key: str) -> dict[str, Any] | None:
    item = _response_cache.get(key)
    if not item:
        return None
    exp, payload = item
    if exp < time.time():
        _response_cache.pop(key, None)
        return None
    return payload


def _cache_set(key: str, payload: dict[str, Any]) -> None:
    _response_cache[key] = (time.time() + CACHE_TTL_SEC, payload)


def _hash_key(*parts: str) -> str:
    raw = "|".join(parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _rule_based_reply(message: str, rag_block: str, user_ctx: str) -> str:
    lower = message.lower()
    if "колен" in lower:
        return (
            "⚠️ Боль в коленях — не игнорьте.\n"
            f"{user_ctx}\n\n"
            "Рекомендации:\n"
            "• снизьте ударную нагрузку на 3–7 дней\n"
            "• замените выпады/прыжки на leg press / glute bridge\n"
            "• следите за коленом над стопой\n\n"
            f"Из базы упражнений:\n{rag_block}\n\n"
            "Если боль острая/отёчная — к врачу, я не ставлю диагнозы."
        )
    if "замен" in lower or "вместо" in lower:
        return (
            "🔁 Замена упражнения\n"
            f"{user_ctx}\n\n"
            f"Можно опереться на эти варианты из каталога:\n{rag_block}\n\n"
            "Критерии замены: та же группа мышц, доступное оборудование, "
            "без боли в суставах."
        )
    if "прогресс" in lower or "анализ" in lower:
        return (
            "📊 Краткий разбор\n"
            f"{user_ctx}\n\n"
            "Пришлите / нажмите «Проанализируй прогресс» — соберу данные за 14 дней "
            "и дам одну конкретную корректировку.\n\n"
            f"Контекст упражнений:\n{rag_block}"
        )
    return (
        "💪 На связи AI-тренер\n"
        f"{user_ctx}\n\n"
        f"По вашему запросу полезный контекст:\n{rag_block}\n\n"
        "Уточните цель (сила/масса/похудение) или упражнение — подскажу технику "
        "и прогрессию. Медицинские диагнозы не ставлю."
    )


async def _call_llm(settings: Settings, system: str, user_prompt: str) -> str | None:
    if not settings.llm_api_key:
        return None
    base = (settings.llm_base_url or "https://api.openai.com/v1").rstrip("/")
    url = f"{base}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.4,
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, json=body)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]
    except Exception:
        return None


async def chat(
    session: AsyncSession,
    user: User,
    *,
    message: str,
    session_id: uuid.UUID | None,
    settings: Settings,
) -> tuple[uuid.UUID, str, str]:
    sid = session_id or uuid.uuid4()
    cache_key = _hash_key(str(user.id), message.strip().lower())
    cached = _cache_get(cache_key)
    if cached:
        reply = str(cached["reply"])
        source = "cache"
    else:
        rag_items = await retrieve_exercise_context(session, message, limit=3)
        rag_block = format_rag_block(rag_items)
        user_ctx = build_user_context(user.username, user.goals or {}, user.anthropometry or {})
        system = f"{SYSTEM_TRAINER}\n{user_ctx}"
        user_prompt = (
            f"Вопрос пользователя: {message}\n\n"
            f"RAG-контекст упражнений:\n{rag_block}\n\n"
            "Ответь кратко по-русски."
        )
        llm_reply = await _call_llm(settings, system, user_prompt)
        if llm_reply:
            reply = llm_reply
            source = "llm"
        else:
            reply = _rule_based_reply(message, rag_block, user_ctx)
            source = "rule"
        _cache_set(cache_key, {"reply": reply})

    session.add(
        AIConversation(
            user_id=user.id,
            session_id=sid,
            role="user",
            content=message,
        )
    )
    session.add(
        AIConversation(
            user_id=user.id,
            session_id=sid,
            role="assistant",
            content=reply,
        )
    )
    await session.commit()
    return sid, reply, source


async def analyze_progress(
    session: AsyncSession,
    user: User,
    *,
    days: int,
    settings: Settings,
) -> tuple[str, str]:
    since = date.today() - timedelta(days=days)
    result = await session.scalars(
        select(Workout)
        .options(selectinload(Workout.sets))
        .where(
            Workout.user_id == user.id,
            Workout.is_deleted.is_(False),
            Workout.status == "completed",
            Workout.scheduled_date >= since,
        )
        .order_by(Workout.scheduled_date.asc())
    )
    workouts = list(result.all())
    total_sets = 0
    volume = 0.0
    rpe_vals: list[int] = []
    for w in workouts:
        if w.rpe is not None:
            rpe_vals.append(int(w.rpe))
        for s in w.sets:
            if not s.is_completed:
                continue
            total_sets += 1
            reps = float(s.reps or 0)
            weight = float(s.weight or 0)
            volume += reps * weight

    avg_rpe = round(sum(rpe_vals) / len(rpe_vals), 1) if rpe_vals else None
    summary = {
        "days": days,
        "completed_workouts": len(workouts),
        "completed_sets": total_sets,
        "volume": round(volume, 1),
        "avg_rpe": avg_rpe,
        "goal": (user.goals or {}).get("primary_goal"),
    }
    cache_key = _hash_key("analyze", str(user.id), json.dumps(summary, sort_keys=True))
    cached = _cache_get(cache_key)
    if cached:
        return str(cached["reply"]), "cache"

    user_ctx = build_user_context(user.username, user.goals or {}, user.anthropometry or {})
    facts = (
        f"За {days} дн.: тренировок {summary['completed_workouts']}, "
        f"подходов {summary['completed_sets']}, объём {summary['volume']} кг·повт, "
        f"средний RPE {avg_rpe if avg_rpe is not None else 'н/д'}."
    )
    system = f"{SYSTEM_TRAINER}\n{user_ctx}"
    prompt = (
        f"Сделай короткий отчёт прогресса и РОВНО одну конкретную рекомендацию.\n{facts}"
    )
    llm_reply = await _call_llm(settings, system, prompt)
    if llm_reply:
        report = llm_reply
        source = "llm"
    else:
        if summary["completed_workouts"] == 0:
            report = (
                f"📭 За {days} дней завершённых тренировок нет.\n"
                "Рекомендация: запланируйте 2 короткие сессии на этой неделе "
                "(30–40 мин) и отметьте подходы в приложении."
            )
        elif avg_rpe is not None and avg_rpe >= 9:
            report = (
                f"📈 {facts}\n"
                "Рекомендация: снизьте рабочие веса на 5–10% на 1 неделю и "
                "добавьте +1 минуту отдыха — это снизит риск перегруза."
            )
        else:
            report = (
                f"📈 {facts}\n"
                "Рекомендация: на следующей неделе добавьте +1 подход в базовом "
                "упражнении или +2.5 кг, если техника стабильна."
            )
        source = "rule"

    _cache_set(cache_key, {"reply": report})
    return report, source
