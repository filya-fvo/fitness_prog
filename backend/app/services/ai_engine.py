"""Hybrid AI engine: rule-based + optional LLM + RAG (TZ §6)."""

from __future__ import annotations

import re
import uuid
from datetime import date, timedelta

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
from app.services.local_llm import call_local_chat

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
_FOREIGN_SCRIPT_RE = re.compile(r"[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]")
_LONG_LATIN_WORD_RE = re.compile(r"[a-z]{4,}", re.IGNORECASE)
_ALLOWED_LATIN_WORDS = {"crossfit", "fitness", "hiit"}


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


_URGENT_HEALTH_MARKERS = (
    "боль в груди",
    "не могу дышать",
    "потерял сознание",
    "потеряла сознание",
    "сильное кровотечение",
    "резкая боль",
    "острая боль",
    "сильный отёк",
    "сильный отек",
)
_PAIN_MARKERS = (
    "боль",
    "боле",
    "болит",
    "болят",
    "забол",
    "ноет",
    "дискомфорт",
)
_REST_TIMING_MARKERS = (
    "сколько отдых",
    "отдыхать между",
    "отдых между",
)
_POST_WORKOUT_FOOD_MARKERS = (
    "что есть после трен",
    "что поесть после трен",
    "еда после трен",
    "питание после трен",
)


def _has_urgent_health_marker(message: str) -> bool:
    lowered = message.casefold()
    return any(marker in lowered for marker in _URGENT_HEALTH_MARKERS)


def _requires_rule_only(message: str) -> bool:
    lowered = message.casefold()
    direct_markers = (
        *_URGENT_HEALTH_MARKERS,
        *_PAIN_MARKERS,
        *_REST_TIMING_MARKERS,
        *_POST_WORKOUT_FOOD_MARKERS,
    )
    return any(marker in lowered for marker in direct_markers)


def _rule_based_reply(message: str, rag_block: str) -> str:
    lower = message.lower()
    if _has_urgent_health_marker(message):
        return (
            "⚠️ Прекратите тренировку. При резкой боли, затруднённом дыхании, "
            "потере сознания или сильном кровотечении срочно обратитесь за медицинской "
            "помощью. Я не ставлю диагнозы и не предлагаю продолжать нагрузку при таких симптомах."
        )
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
    if any(marker in lower for marker in _PAIN_MARKERS):
        return (
            "⚠️ Остановите упражнение или движение, которое вызывает боль, и не пытайтесь "
            "доработать подход через неё. Уберите болезненную нагрузку, оцените самочувствие "
            "в покое и возвращайтесь к упражнению только без боли, с меньшим весом и проверкой "
            "техники. Если боль острая, нарастает, сопровождается отёком, слабостью или онемением "
            "либо не проходит — обратитесь к врачу. Я не ставлю диагнозы."
        )
    if any(marker in lower for marker in _REST_TIMING_MARKERS):
        if any(marker in lower for marker in ("тяж", "силов", "базов", "многосустав")):
            return (
                "Между тяжёлыми рабочими подходами отдыхайте 2–4 минуты. "
                "После почти предельного подхода допустимо до 5 минут: начинайте следующий, "
                "когда восстановились дыхание и готовность держать технику."
            )
        return (
            "Для большинства рабочих подходов ориентир — 60–120 секунд, а для тяжёлых "
            "многосуставных — 2–4 минуты. Начинайте следующий подход, когда можете снова "
            "стабильно держать технику; короткий отдых не должен ухудшать качество повторов."
        )
    if any(marker in lower for marker in _POST_WORKOUT_FOOD_MARKERS):
        return (
            "После тренировки подойдёт обычный приём пищи с источником белка и углеводов: "
            "например, птица, рыба, яйца или творог плюс крупа, картофель или фрукты. "
            "Специальное короткое «окно» не требуется. Точную порцию выбирайте по дневной "
            "калорийной цели и уже записанному рациону; также восполните жидкость."
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
        "Локальная модель сейчас недоступна. Данные программы и тренировок сохранены, "
        "но безопасный режим не будет придумывать ответ по ним. Повторите запрос позже."
    )


async def _call_configured_ai(
    settings: Settings,
    instructions: str,
    user_prompt: str,
    *,
    echo_source: str | None = None,
) -> tuple[str | None, str]:
    reply = await call_local_chat(
        settings,
        instructions,
        user_prompt,
    )
    checked = _russian_only(sanitize_ai_output(reply))
    if checked and echo_source and _looks_like_context_echo(checked, echo_source):
        return None, "rule"
    return checked, "local" if checked else "rule"


def _russian_only(reply: str | None) -> str | None:
    """Reject model drift into English; callers then use the Russian rule fallback."""
    if not reply or not reply.strip():
        return None
    text = reply.strip()
    if _FOREIGN_SCRIPT_RE.search(text):
        return None
    foreign_words = {
        word.casefold()
        for word in _LONG_LATIN_WORD_RE.findall(text)
        if word.casefold() not in _ALLOWED_LATIN_WORDS
    }
    if foreign_words:
        return None
    cyrillic = sum("а" <= char.lower() <= "я" or char.lower() == "ё" for char in text)
    latin = sum("a" <= char.lower() <= "z" for char in text)
    if (latin >= 3 and cyrillic < 3) or (latin >= 12 and cyrillic < max(8, latin // 4)):
        return None
    return text


def _normalized_words(text: str) -> list[str]:
    return re.findall(r"[а-яёa-z0-9]+", text.casefold())


def _looks_like_context_echo(reply: str, context: str) -> bool:
    """Reject a response that starts by copying a long application-context fragment."""
    reply_words = _normalized_words(reply)
    context_words = _normalized_words(context)
    if len(reply_words) < 8:
        return False
    prefix = " ".join(reply_words[:8])
    return prefix in " ".join(context_words)


def _bounded_context(text: str, *, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    head_size = max_chars // 3
    tail_size = max_chars - head_size
    return f"{text[:head_size]}\n…\n{text[-tail_size:]}"


def _build_chat_prompt(
    *,
    message: str,
    app_context: str,
    catalog_context: str,
    history: list[dict[str, str]],
) -> str:
    history_lines = []
    for item in history:
        content = item["content"].strip()
        if item["role"] == "assistant" and _looks_like_context_echo(content, app_context):
            continue
        history_lines.append(f"{item['role']}: {content[:1_200]}")
    history_block = "\n".join(history_lines) or "История этого диалога пуста."
    return (
        "ЗАДАЧА: ответь на последний вопрос пользователя.\n\n"
        "<application_context>\n"
        f"{_bounded_context(app_context, max_chars=5_500)}\n"
        "</application_context>\n\n"
        "<catalog_context>\n"
        f"{_bounded_context(catalog_context, max_chars=1_200)}\n"
        "</catalog_context>\n\n"
        "<conversation_history>\n"
        f"{_bounded_context(history_block, max_chars=1_600)}\n"
        "</conversation_history>\n\n"
        f"ПОСЛЕДНИЙ ВОПРОС: {message}\n"
        "Начни сразу с полезного ответа на этот вопрос. Не пересказывай контекст."
    )


async def chat(
    session: AsyncSession,
    user: User,
    *,
    message: str,
    session_id: uuid.UUID | None,
    settings: Settings,
) -> tuple[uuid.UUID, str, str]:
    sid = session_id or uuid.uuid4()
    rag_items = await retrieve_exercise_context(session, message, limit=3)
    rag_block = format_rag_block(rag_items)
    app_context = await build_application_context(session, user)
    history = await conversation_history(
        session,
        user_id=user.id,
        session_id=sid,
        limit=4,
    )
    system = SYSTEM_TRAINER
    if rag_items:
        catalog_context = f"Совпадения в каталоге упражнений:\n{rag_block}"
    else:
        catalog_context = (
            "По этому вопросу релевантные упражнения в каталоге не найдены. "
            "Не подставляй случайные упражнения."
        )
    user_prompt = _build_chat_prompt(
        message=message,
        app_context=app_context,
        catalog_context=catalog_context,
        history=history,
    )
    # Medical red flags are handled by deterministic rules. A small language
    # model must never be allowed to improvise whether exercise is safe.
    if _requires_rule_only(message):
        llm_reply, llm_source = None, "rule"
    else:
        llm_reply, llm_source = await _call_configured_ai(
            settings,
            system,
            user_prompt,
            echo_source=app_context,
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
