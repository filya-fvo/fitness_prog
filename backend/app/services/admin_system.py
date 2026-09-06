"""Read-only, allowlisted diagnostics for the administrator dashboard."""

from __future__ import annotations

import asyncio
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import httpx
from loguru import logger
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.schemas.admin_system import (
    AdminSystemCheck,
    AdminSystemCheckKey,
    AdminSystemFact,
    AdminSystemStatus,
    AdminSystemStatusResponse,
)
from app.services import local_llm, telegram_bot

WORKER_STATUS_KEY = "fitness:admin:worker:heartbeat"
NOTIFICATION_STATUS_KEY = "fitness:admin:notifications:last"
TELEGRAM_POLLER_STATUS_KEY = "fitness:admin:telegram-poller:heartbeat"
ARQ_QUEUE_KEY = "arq:queue"
_COMMIT_RE = re.compile(r"^[0-9a-fA-F]{7,64}$")
_LOCAL_OCR_HOSTS = {"ocr", "localhost", "127.0.0.1", "::1"}
_TELEGRAM_RECENT_ERROR_MINUTES = 30
_STATUS_PRIORITY: dict[AdminSystemStatus, int] = {
    "normal": 0,
    "no_data": 1,
    "attention": 2,
    "error": 3,
}


def _fact(label: str, value: object, kind: str = "text") -> AdminSystemFact:
    return AdminSystemFact(label=label, value=str(value), kind=kind)  # type: ignore[arg-type]


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _parse_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or len(value) > 64:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(UTC)


def _read_status_file(status_dir: str, filename: str) -> dict[str, Any] | None:
    if not status_dir:
        return None
    root = Path(status_dir)
    path = root / filename
    try:
        if not path.is_file() or path.stat().st_size > 16_384:
            return None
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        logger.warning("admin_status_file_unreadable file={}", filename)
        return None
    return payload if isinstance(payload, dict) else None


async def probe_database(session: AsyncSession, checked_at: datetime) -> AdminSystemCheck:
    started = perf_counter()
    try:
        await session.execute(text("SELECT 1"))
    except Exception as exc:
        logger.warning("admin_database_probe_failed err_type={}", type(exc).__name__)
        return AdminSystemCheck(
            key="database",
            title="PostgreSQL",
            status="error",
            summary="База данных не ответила на безопасную проверку.",
            next_step="Проверьте контейнер db и его журнал на VPS.",
            observed_at=checked_at,
        )
    latency_ms = round((perf_counter() - started) * 1000)
    return AdminSystemCheck(
        key="database",
        title="PostgreSQL",
        status="normal",
        summary="База данных отвечает.",
        next_step="Действий не требуется.",
        observed_at=checked_at,
        facts=[_fact("Время ответа", f"{latency_ms} мс")],
    )


def _runtime_json(value: object) -> dict[str, Any] | None:
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")
    if not isinstance(value, str) or len(value) > 16_384:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _worker_check(payload: dict[str, Any] | None, checked_at: datetime) -> AdminSystemCheck:
    observed_at = _parse_datetime((payload or {}).get("recorded_at"))
    if observed_at is None:
        return AdminSystemCheck(
            key="worker",
            title="Фоновый worker",
            status="no_data",
            summary="Heartbeat worker ещё не получен.",
            next_step="Проверьте, что worker запущен, затем повторите проверку через минуту.",
        )
    age_seconds = max(0, (checked_at - observed_at).total_seconds())
    raw_state = str((payload or {}).get("state") or "").strip()[:32]
    if raw_state == "failed":
        status = "error"
        summary = "Последняя фоновая задача завершилась ошибкой."
        next_step = "Проверьте последние логи worker."
    elif raw_state == "stopped":
        status = "attention"
        summary = "Worker сообщил об остановке."
        next_step = "Проверьте состояние контейнера worker."
    elif age_seconds <= 150:
        status: AdminSystemStatus = "normal"
        summary = "Worker регулярно сообщает о работе."
        next_step = "Действий не требуется."
    elif age_seconds <= 300:
        status = "attention"
        summary = "Heartbeat worker задерживается."
        next_step = "Подождите минуту и повторите проверку."
    else:
        status = "error"
        summary = "Worker давно не сообщал о работе."
        next_step = "Проверьте контейнер worker и его последние логи."
    task = str((payload or {}).get("task") or "").strip()[:80]
    state = raw_state
    facts = [_fact("Последний heartbeat", observed_at.isoformat(), "datetime")]
    if task:
        facts.append(_fact("Последняя задача", task))
    if state:
        facts.append(_fact("Результат задачи", state))
    return AdminSystemCheck(
        key="worker",
        title="Фоновый worker",
        status=status,
        summary=summary,
        next_step=next_step,
        observed_at=observed_at,
        facts=facts,
    )


def _notification_check(payload: dict[str, Any] | None) -> AdminSystemCheck:
    observed_at = _parse_datetime((payload or {}).get("recorded_at"))
    if observed_at is None:
        return AdminSystemCheck(
            key="notifications",
            title="Уведомления",
            status="no_data",
            summary="Результат последнего прохода пока не записан.",
            next_step="Дождитесь следующей минутной проверки worker.",
        )
    try:
        processed = max(0, int((payload or {}).get("processed", 0)))
        sent = max(0, int((payload or {}).get("sent", 0)))
        errors = max(0, int((payload or {}).get("errors", 0)))
    except (TypeError, ValueError):
        processed = sent = errors = 0
    status: AdminSystemStatus = "attention" if errors else "normal"
    return AdminSystemCheck(
        key="notifications",
        title="Уведомления",
        status=status,
        summary=(
            "Последний проход завершён с ошибками доставки."
            if errors
            else "Последний проход завершён без ошибок."
        ),
        next_step=(
            "Проверьте журнал worker по ошибкам доставки."
            if errors
            else "Действий не требуется."
        ),
        observed_at=observed_at,
        facts=[
            _fact("Обработано", processed, "number"),
            _fact("Отправлено", sent, "number"),
            _fact("Ошибок", errors, "number"),
            _fact("Последний проход", observed_at.isoformat(), "datetime"),
        ],
    )


async def probe_redis(settings: Settings, checked_at: datetime) -> list[AdminSystemCheck]:
    from redis.asyncio import Redis

    started = perf_counter()
    client = Redis.from_url(
        settings.redis_url,
        decode_responses=True,
        socket_connect_timeout=1.5,
        socket_timeout=1.5,
    )
    try:
        await client.ping()
        queue_length = int(await client.zcard(ARQ_QUEUE_KEY))
        worker_payload = _runtime_json(await client.get(WORKER_STATUS_KEY))
        notification_payload = _runtime_json(await client.get(NOTIFICATION_STATUS_KEY))
    except Exception as exc:
        logger.warning("admin_redis_probe_failed err_type={}", type(exc).__name__)
        return [
            AdminSystemCheck(
                key="redis",
                title="Redis",
                status="error",
                summary="Redis не ответил на безопасную проверку.",
                next_step="Проверьте контейнер redis и его журнал на VPS.",
                observed_at=checked_at,
            ),
            _worker_check(None, checked_at),
            _notification_check(None),
            AdminSystemCheck(
                key="queue",
                title="Очередь задач",
                status="no_data",
                summary="Длина очереди недоступна, пока Redis не отвечает.",
                next_step="Сначала восстановите Redis.",
            ),
        ]
    finally:
        try:
            await client.aclose()
        except Exception as exc:
            logger.warning("admin_redis_close_failed err_type={}", type(exc).__name__)
    latency_ms = round((perf_counter() - started) * 1000)
    if queue_length > 200:
        queue_status: AdminSystemStatus = "error"
        queue_summary = "Очередь задач критически выросла."
        queue_step = "Проверьте worker и причины повторных задач."
    elif queue_length > 50:
        queue_status = "attention"
        queue_summary = "Очередь задач больше обычного."
        queue_step = "Повторите проверку через несколько минут."
    else:
        queue_status = "normal"
        queue_summary = "Очередь задач в допустимом диапазоне."
        queue_step = "Действий не требуется."
    return [
        AdminSystemCheck(
            key="redis",
            title="Redis",
            status="normal",
            summary="Redis отвечает.",
            next_step="Действий не требуется.",
            observed_at=checked_at,
            facts=[_fact("Время ответа", f"{latency_ms} мс")],
        ),
        _worker_check(worker_payload, checked_at),
        _notification_check(notification_payload),
        AdminSystemCheck(
            key="queue",
            title="Очередь задач",
            status=queue_status,
            summary=queue_summary,
            next_step=queue_step,
            observed_at=checked_at,
            facts=[_fact("Ожидает", queue_length, "number")],
        ),
    ]


def backup_check(settings: Settings, checked_at: datetime) -> AdminSystemCheck:
    payload = _read_status_file(settings.admin_system_status_dir, "backup.json")
    completed_at = _parse_datetime((payload or {}).get("completed_at"))
    recorded_at = _parse_datetime((payload or {}).get("recorded_at"))
    if payload is None or (completed_at is None and recorded_at is None):
        return AdminSystemCheck(
            key="backup",
            title="Резервная копия",
            status="no_data",
            summary="Хост ещё не передал результат backup.",
            next_step="Проверьте timer backup и status-файл на VPS.",
        )
    if payload.get("status") != "ok" or completed_at is None:
        return AdminSystemCheck(
            key="backup",
            title="Резервная копия",
            status="error",
            summary="Последняя попытка backup завершилась ошибкой.",
            next_step="Проверьте fitness-backup.service и свободное место.",
            observed_at=recorded_at,
        )
    age_hours = max(0, (checked_at - completed_at).total_seconds()) / 3600
    status: AdminSystemStatus = "normal" if age_hours <= 36 else "attention"
    return AdminSystemCheck(
        key="backup",
        title="Резервная копия",
        status=status,
        summary=("Свежая проверенная копия доступна." if status == "normal" else "Копия устарела."),
        next_step=("Действий не требуется." if status == "normal" else "Проверьте ежедневный timer backup."),
        observed_at=completed_at,
        facts=[_fact("Последний backup", completed_at.isoformat(), "datetime")],
    )


def deployment_check(settings: Settings) -> AdminSystemCheck:
    payload = _read_status_file(settings.admin_system_status_dir, "deployment.json")
    deployed_at = _parse_datetime((payload or {}).get("deployed_at"))
    commit = str((payload or {}).get("commit") or "")
    version = str((payload or {}).get("version") or "")[:32]
    if deployed_at is None or not _COMMIT_RE.fullmatch(commit):
        return AdminSystemCheck(
            key="deployment",
            title="Версия",
            status="no_data",
            summary="Данные о развёртывании ещё не записаны.",
            next_step="После выпуска обновите безопасный status-файл deployment.",
        )
    facts = [
        _fact("Commit", commit[:12]),
        _fact("Развёрнуто", deployed_at.isoformat(), "datetime"),
    ]
    if version and len(version) <= 32:
        facts.insert(0, _fact("Версия", version))
    return AdminSystemCheck(
        key="deployment",
        title="Версия",
        status="normal",
        summary="Версия production определена.",
        next_step="Действий не требуется.",
        observed_at=deployed_at,
        facts=facts,
    )


def https_check(settings: Settings, checked_at: datetime) -> AdminSystemCheck:
    payload = _read_status_file(settings.admin_system_status_dir, "https.json")
    expires_at = _parse_datetime((payload or {}).get("expires_at"))
    if expires_at is None:
        return AdminSystemCheck(
            key="https",
            title="HTTPS-сертификат",
            status="no_data",
            summary="Срок сертификата ещё не передан хостом.",
            next_step="Обновите безопасный HTTPS status-файл на VPS.",
        )
    days = int((expires_at - checked_at).total_seconds() // 86_400)
    if days < 0:
        status: AdminSystemStatus = "error"
        summary = "Срок HTTPS-сертификата истёк."
        step = "Проверьте Caddy и продление сертификата."
    elif days < 14:
        status = "attention"
        summary = "Срок HTTPS-сертификата скоро истечёт."
        step = "Проверьте Caddy и автоматическое продление."
    else:
        status = "normal"
        summary = "HTTPS-сертификат действует."
        step = "Действий не требуется."
    return AdminSystemCheck(
        key="https",
        title="HTTPS-сертификат",
        status=status,
        summary=summary,
        next_step=step,
        observed_at=checked_at,
        facts=[
            _fact("Действует до", expires_at.isoformat(), "datetime"),
            _fact("Осталось дней", max(0, days), "number"),
        ],
    )


async def _internal_http_check(
    *,
    key: AdminSystemCheckKey,
    title: str,
    url: str,
    configured: bool,
    checked_at: datetime,
) -> AdminSystemCheck:
    if not configured:
        return AdminSystemCheck(
            key=key,
            title=title,
            status="error",
            summary="Внутренний сервис настроен небезопасно.",
            next_step="Проверьте внутренний адрес сервиса в конфигурации.",
            observed_at=checked_at,
        )
    started = perf_counter()
    try:
        async with httpx.AsyncClient(timeout=2.5) as client:
            response = await client.get(url)
            response.raise_for_status()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("admin_internal_probe_failed key={} err_type={}", key, type(exc).__name__)
        return AdminSystemCheck(
            key=key,
            title=title,
            status="attention",
            summary="Внутренний сервис не ответил на проверку.",
            next_step=f"Проверьте контейнер {key} и его последние логи.",
            observed_at=checked_at,
        )
    latency_ms = round((perf_counter() - started) * 1000)
    return AdminSystemCheck(
        key=key,
        title=title,
        status="normal",
        summary="Внутренний сервис отвечает.",
        next_step="Действий не требуется.",
        observed_at=checked_at,
        facts=[_fact("Время ответа", f"{latency_ms} мс")],
    )


async def probe_llm(settings: Settings, checked_at: datetime) -> AdminSystemCheck:
    parsed = urlsplit(settings.llm_base_url.strip())
    health_url = urlunsplit((parsed.scheme, parsed.netloc, "/health", "", ""))
    return await _internal_http_check(
        key="llm",
        title="Локальный ИИ",
        url=health_url,
        configured=local_llm.is_local_ai_config(settings),
        checked_at=checked_at,
    )


async def probe_ocr(settings: Settings, checked_at: datetime) -> AdminSystemCheck:
    parsed = urlsplit(settings.ocr_base_url.strip())
    configured = parsed.scheme == "http" and (parsed.hostname or "").casefold() in _LOCAL_OCR_HOSTS
    health_url = f"{settings.ocr_base_url.rstrip('/')}/health"
    return await _internal_http_check(
        key="ocr",
        title="Распознавание этикеток",
        url=health_url,
        configured=configured,
        checked_at=checked_at,
    )


async def probe_telegram(settings: Settings, checked_at: datetime) -> AdminSystemCheck:
    if not settings.bot_token or settings.bot_token.startswith("replace_with"):
        return AdminSystemCheck(
            key="telegram",
            title="Telegram-бот",
            status="no_data",
            summary="Telegram-бот не настроен.",
            next_step="Настройте BOT_TOKEN и способ получения updates.",
        )

    poller_payload: dict[str, Any] | None = None
    if settings.telegram_update_mode == "polling":
        from redis.asyncio import Redis

        redis = Redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=1.5,
            socket_timeout=1.5,
        )
        try:
            poller_payload = _runtime_json(await redis.get(TELEGRAM_POLLER_STATUS_KEY))
        except Exception as exc:
            logger.warning("admin_telegram_poller_probe_failed err_type={}", type(exc).__name__)
        finally:
            try:
                await redis.aclose()
            except Exception as exc:
                logger.warning(
                    "admin_telegram_poller_close_failed err_type={}",
                    type(exc).__name__,
                )
    try:
        response = await asyncio.wait_for(telegram_bot.get_webhook_info(settings), timeout=3.0)
        result = response.get("result") if isinstance(response, dict) else None
        if not isinstance(result, dict):
            raise ValueError("unexpected response")
        url_ready = str(result.get("url") or "").startswith("https://")
        pending = max(0, int(result.get("pending_update_count") or 0))
        last_error_age: int | None = None
        last_error_recent = False
        if result.get("last_error_message"):
            try:
                last_error_at = datetime.fromtimestamp(
                    int(result.get("last_error_date")),
                    UTC,
                )
                last_error_age = max(
                    0,
                    int((checked_at - last_error_at).total_seconds() // 60),
                )
                last_error_recent = last_error_age <= _TELEGRAM_RECENT_ERROR_MINUTES
            except (OSError, OverflowError, TypeError, ValueError):
                last_error_recent = True
    except (TimeoutError, telegram_bot.TelegramBotError, TypeError, ValueError) as exc:
        logger.warning("admin_telegram_probe_failed err_type={}", type(exc).__name__)
        return AdminSystemCheck(
            key="telegram",
            title="Telegram-бот",
            status="attention",
            summary="Telegram не ответил на безопасную проверку.",
            next_step="Проверьте доступ к Telegram Bot API.",
            observed_at=checked_at,
        )
    if settings.telegram_update_mode == "polling":
        poller_at = _parse_datetime((poller_payload or {}).get("recorded_at"))
        poller_age = (
            max(0, int((checked_at - poller_at).total_seconds()))
            if poller_at is not None
            else None
        )
        poller_state = str((poller_payload or {}).get("state") or "")[:32]
        status: AdminSystemStatus = "normal"
        summary = "Long polling получает события Telegram без публичного webhook."
        next_step = "Действий не требуется."
        if url_ready:
            status = "attention"
            summary = "Webhook снова включён и конфликтует с long polling."
            next_step = "Проверьте контейнер telegram-poller."
        elif poller_age is None or poller_age > 120:
            status = "error"
            summary = "Long polling давно не сообщал о работе."
            next_step = "Проверьте контейнер telegram-poller и его журнал."
        elif poller_state in {"telegram_unavailable", "dispatch_failed"}:
            status = "attention"
            summary = "Long polling работает с временными ошибками доставки."
            next_step = "Повторите проверку через минуту."
        elif pending > 10:
            status = "attention" if pending <= 50 else "error"
            summary = "В Telegram накопились ожидающие события."
            next_step = "Проверьте контейнер telegram-poller и его журнал."
        facts = [
            _fact("Режим", "long polling"),
            _fact("Ожидает updates", pending, "number"),
        ]
        if poller_at is not None:
            facts.append(_fact("Последний heartbeat", poller_at.isoformat(), "datetime"))
        return AdminSystemCheck(
            key="telegram",
            title="Telegram-бот",
            status=status,
            summary=summary,
            next_step=next_step,
            observed_at=poller_at or checked_at,
            facts=facts,
        )
    status: AdminSystemStatus = "normal"
    if not url_ready or last_error_recent or pending > 50:
        status = "error" if not url_ready or pending > 200 else "attention"
    summary = "Webhook зарегистрирован и отвечает."
    if not url_ready:
        summary = "Webhook не зарегистрирован на безопасном HTTPS-адресе."
    elif pending > 50:
        summary = "В очереди Telegram накопились необработанные updates."
    elif last_error_recent:
        summary = "Webhook отвечает, но Telegram недавно фиксировал ошибку доставки."
    facts = [
        _fact("Ожидает updates", pending, "number"),
        _fact("Выделенный smoke", "настроен" if settings.admin_smoke_telegram_id else "не настроен"),
    ]
    if last_error_age is not None:
        facts.append(_fact("Последняя ошибка", f"{last_error_age} мин назад"))
    return AdminSystemCheck(
        key="telegram",
        title="Telegram webhook",
        status=status,
        summary=summary,
        next_step=("Действий не требуется." if status == "normal" else "Проверьте очередь и последние ошибки Telegram webhook."),
        observed_at=checked_at,
        facts=facts,
    )


def email_check(settings: Settings, checked_at: datetime) -> AdminSystemCheck:
    configured = bool(
        settings.smtp_password.strip()
        and settings.smtp_host.strip()
        and settings.smtp_from_email.strip()
    )
    return AdminSystemCheck(
        key="email",
        title="Email",
        status="normal" if configured else "no_data",
        summary=("SMTP настроен для отправки." if configured else "SMTP не настроен для реальной отправки."),
        next_step=("Действий не требуется." if configured else "Настройте SMTP перед включением email-входа."),
        observed_at=checked_at,
        facts=[_fact("Режим соединения", "SSL" if settings.smtp_use_ssl else "STARTTLS")],
    )


async def collect_system_status(
    session: AsyncSession,
    settings: Settings,
) -> AdminSystemStatusResponse:
    checked_at = _utc_now()
    database = await probe_database(session, checked_at)
    redis_items, llm, ocr, telegram = await asyncio.gather(
        probe_redis(settings, checked_at),
        probe_llm(settings, checked_at),
        probe_ocr(settings, checked_at),
        probe_telegram(settings, checked_at),
    )
    items = [
        AdminSystemCheck(
            key="api",
            title="API",
            status="normal",
            summary="API отвечает на защищённый запрос.",
            next_step="Действий не требуется.",
            observed_at=checked_at,
        ),
        database,
        *redis_items,
        backup_check(settings, checked_at),
        deployment_check(settings),
        https_check(settings, checked_at),
        llm,
        ocr,
        telegram,
        email_check(settings, checked_at),
    ]
    overall_status = max(
        (item.status for item in items),
        key=lambda value: _STATUS_PRIORITY[value],
    )
    return AdminSystemStatusResponse(
        checked_at=checked_at,
        overall_status=overall_status,
        items=items,
    )
