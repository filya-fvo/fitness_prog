"""Hybrid AI engine: rule-based + optional LLM + RAG (TZ §6)."""

from __future__ import annotations

import uuid
import time
import re
from datetime import date, timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.context import build_application_context, conversation_history
from app.ai.prompts import SYSTEM_TRAINER
from app.ai.rag import format_rag_block, retrieve_exercise_context
from app.core.config import Settings
from app.models.ai_conversation import AIConversation
from app.models.user import User
from app.models.workout import Workout

_groq_model_cooldowns: dict[str, float] = {}

_THINK_BLOCK_RE = re.compile(r"<think\b[^>]*>.*?</think\s*>", re.IGNORECASE | re.DOTALL)
_THINK_OPEN_RE = re.compile(r"<think\b[^>]*>", re.IGNORECASE)
_THINK_CLOSE_RE = re.compile(r"</think\s*>", re.IGNORECASE)
_REASONING_LEAK_MARKERS = (
    "here's a thinking process",
    "here is a thinking process",
    "analyze user input",
    "identify key requirements",
    "system prompt",
    "developer message",
)


def sanitize_ai_output(reply: str | None) -> str | None:
    """Return only user-facing model text, never hidden reasoning or prompt fragments."""
    if not reply or not reply.strip():
        return None
    text = _THINK_BLOCK_RE.sub("", reply).strip()

    # An interrupted provider response can contain an opening tag without a closing one.
    # Keep a final answer that precedes the tag; otherwise reject the whole response.
    open_match = _THINK_OPEN_RE.search(text)
    if open_match:
        text = text[: open_match.start()].strip()
    close_match = _THINK_CLOSE_RE.search(text)
    if close_match:
        text = text[close_match.end() :].strip()

    lowered = text.casefold()
    if any(marker in lowered for marker in _REASONING_LEAK_MARKERS):
        return None
    text = re.sub(r"^```(?:markdown|text)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text).strip()
    return text or None


def _groq_models(settings: Settings) -> list[str]:
    candidates = [settings.llm_model, *settings.llm_fallback_models.split(",")]
    result: list[str] = []
    for candidate in candidates:
        model = candidate.strip()
        if model and model not in result:
            result.append(model)
    return result or ["llama-3.1-8b-instant"]


def _groq_retry_after_seconds(response: httpx.Response, *, default: float) -> float:
    raw = response.headers.get("retry-after", "").strip()
    try:
        return max(float(raw), 1.0)
    except ValueError:
        return default


def _rule_based_reply(message: str, rag_block: str) -> str:
    lower = message.lower()
    if "колен" in lower:
        return (
            "⚠️ Боль в коленях — не игнорьте.\n"
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
            f"Можно опереться на эти варианты из каталога:\n{rag_block}\n\n"
            "Критерии замены: та же группа мышц, доступное оборудование, "
            "без боли в суставах."
        )
    if "прогресс" in lower or "анализ" in lower:
        return (
            "📊 Краткий разбор\n"
            "Пришлите / нажмите «Проанализируй прогресс» — соберу данные за 14 дней "
            "и дам одну конкретную корректировку.\n\n"
            f"Контекст упражнений:\n{rag_block}"
        )
    return (
        "💪 На связи AI-тренер\n"
        "Внешняя модель сейчас недоступна. Данные программы и тренировок загружены, "
        "но локальный режим не будет придумывать ответ по ним. Повторите запрос позже."
    )


async def _call_groq_chat(
    settings: Settings,
    instructions: str,
    user_prompt: str,
    *,
    reasoning_effort: str = "none",
) -> str | None:
    if not settings.llm_api_key:
        return None
    base = settings.llm_base_url.rstrip("/")
    models = _groq_models(settings)
    now = time.monotonic()
    available = [model for model in models if _groq_model_cooldowns.get(model, 0) <= now]
    if not available:
        available = [min(models, key=lambda model: _groq_model_cooldowns.get(model, 0))]

    from loguru import logger

    async with httpx.AsyncClient(timeout=30.0) as client:
        for index, model in enumerate(available):
            body = {
                "model": model,
                "messages": [
                    {"role": "system", "content": instructions},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.3,
                "max_completion_tokens": 600,
            }
            if model.startswith("qwen/"):
                body["reasoning_effort"] = reasoning_effort
                body["reasoning_format"] = "hidden"
            try:
                response = await client.post(
                    f"{base}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.llm_api_key}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                )
                response.raise_for_status()
                content = response.json()["choices"][0]["message"]["content"]
                if content is not None and str(content).strip():
                    _groq_model_cooldowns.pop(model, None)
                    if index:
                        logger.info("groq_fallback_succeeded model={} position={}", model, index + 1)
                    return str(content).strip()
                logger.warning("groq_empty_response model={}", model)
                return None
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                retryable = status == 429 or status in {403, 404} or status >= 500
                if not retryable:
                    logger.warning(
                        "groq_response_failed model={} status={} fallback=false",
                        model,
                        status,
                    )
                    return None
                default_cooldown = 3600.0 if status in {403, 404} else 30.0
                cooldown = _groq_retry_after_seconds(
                    exc.response,
                    default=default_cooldown,
                )
                _groq_model_cooldowns[model] = time.monotonic() + cooldown
                logger.warning(
                    "groq_model_skipped model={} status={} cooldown_sec={} next={}",
                    model,
                    status,
                    round(cooldown, 1),
                    index + 1 < len(available),
                )
            except (httpx.RequestError, KeyError, TypeError, ValueError) as exc:
                logger.warning("groq_response_failed model={} base={} err={}", model, base, exc)
                return None
    return None


async def _call_configured_ai(
    settings: Settings,
    instructions: str,
    user_prompt: str,
) -> tuple[str | None, str]:
    reply = await _call_groq_chat(
        settings,
        instructions,
        user_prompt,
        reasoning_effort="none",
    )
    checked = _russian_only(sanitize_ai_output(reply))
    return checked, "groq" if checked else "rule"


def _russian_only(reply: str | None) -> str | None:
    """Reject model drift into English; callers then use the Russian rule fallback."""
    if not reply or not reply.strip():
        return None
    text = reply.strip()
    cyrillic = sum("а" <= char.lower() <= "я" or char.lower() == "ё" for char in text)
    latin = sum("a" <= char.lower() <= "z" for char in text)
    if (latin >= 3 and cyrillic < 3) or (latin >= 12 and cyrillic < max(8, latin // 4)):
        return None
    return text


async def chat(
    session: AsyncSession,
    user: User,
    *,
    message: str,
    session_id: uuid.UUID | None,
    settings: Settings,
) -> tuple[uuid.UUID, str, str]:
    sid = session_id or uuid.uuid4()
    rag_items = await retrieve_exercise_context(session, message, limit=5)
    rag_block = format_rag_block(rag_items)
    app_context = await build_application_context(session, user)
    history = await conversation_history(
        session,
        user_id=user.id,
        session_id=sid,
        limit=8,
    )
    system = f"{SYSTEM_TRAINER}\n\n{app_context}"
    if rag_items:
        catalog_context = f"Совпадения в каталоге упражнений:\n{rag_block}"
    else:
        catalog_context = (
            "По этому вопросу релевантные упражнения в каталоге не найдены. "
            "Не подставляй случайные упражнения."
        )
    user_prompt = (
        f"Новый вопрос пользователя: {message}\n\n"
        f"{catalog_context}\n\n"
        "Ответь по фактам из данных приложения и текущей истории."
    )
    if history:
        transcript = "\n".join(
            f"{item['role']}: {item['content']}" for item in history
        )
        user_prompt = (
            "Предыдущая локальная история этого пользователя:\n"
            f"{transcript}\n\n{user_prompt}"
        )
    llm_reply, llm_source = await _call_configured_ai(
        settings,
        system,
        user_prompt,
    )
    if llm_reply:
        reply = llm_reply
        source = llm_source
    else:
        reply = _rule_based_reply(message, rag_block)
        source = "rule"

    await store_exchange(
        session,
        user_id=user.id,
        session_id=sid,
        user_content=message,
        assistant_content=reply,
    )
    return sid, reply, source


async def store_exchange(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    user_content: str,
    assistant_content: str,
) -> None:
    safe_assistant_content = sanitize_ai_output(assistant_content)
    if not safe_assistant_content:
        safe_assistant_content = "Не удалось подготовить корректный ответ. Попробуйте ещё раз."
    session.add_all(
        [
            AIConversation(
                user_id=user_id,
                session_id=session_id,
                role="user",
                content=user_content,
            ),
            AIConversation(
                user_id=user_id,
                session_id=session_id,
                role="assistant",
                content=safe_assistant_content,
            ),
        ]
    )
    await session.commit()


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
    app_context = await build_application_context(session, user)
    facts = (
        f"За {days} дн.: тренировок {summary['completed_workouts']}, "
        f"подходов {summary['completed_sets']}, объём {summary['volume']} кг·повт, "
        f"средний RPE {avg_rpe if avg_rpe is not None else 'н/д'}."
    )
    system = f"{SYSTEM_TRAINER}\n\n{app_context}"
    prompt = (
        f"Сделай короткий отчёт прогресса и РОВНО одну конкретную рекомендацию.\n{facts}"
    )
    llm_reply, llm_source = await _call_configured_ai(
        settings,
        system,
        prompt,
    )
    if llm_reply:
        report = llm_reply
        source = llm_source
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

    return report, source
