import axios from "axios";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  acceptInvite,
  createInvite,
  previewInvite,
  revokeInvite,
  type CreatedInvite,
  type InviteAcceptResult,
  type InvitePreview,
} from "@/api/invites";
import { Header } from "@/components/layout/Header";
import { isTelegramEnvironment, openTelegramLink } from "@/lib/telegram";
import { toUserMessage } from "@/utils/errors";
import { clearPendingInvite } from "@/utils/pendingInvite";

function invitationError(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.detail === "string") {
    return error.response.data.detail;
  }
  return toUserMessage(error, fallback);
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const area = document.createElement("textarea");
  area.value = value;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

function formatExpiry(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(new Date(value));
}

export function InvitePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const [manualCode, setManualCode] = useState("");
  const [credential, setCredential] = useState(token);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(Boolean(token));
  const [creating, setCreating] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState<InviteAcceptResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shareLink = useMemo(
    () => created ? (isTelegramEnvironment() && created.telegram_url ? created.telegram_url : created.web_url) : "",
    [created],
  );

  const loadPreview = useCallback(async (value: string) => {
    setLoadingPreview(true);
    setError(null);
    setAccepted(null);
    try {
      setPreview(await previewInvite(value));
      setCredential(value);
    } catch (reason) {
      setPreview(null);
      setError(invitationError(reason, "Не удалось открыть приглашение."));
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  useEffect(() => {
    if (token) void loadPreview(token);
  }, [loadPreview, token]);

  async function generate() {
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      setCreated(await createInvite());
    } catch (reason) {
      setError(invitationError(reason, "Не удалось создать приглашение."));
    } finally {
      setCreating(false);
    }
  }

  async function share() {
    if (!created || !shareLink) return;
    const text = "Присоединяйся ко мне в Fitness Trainer — будем тренироваться и следить за прогрессом вместе.";
    if (isTelegramEnvironment()) {
      openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(text)}`);
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: "Fitness Trainer", text, url: shareLink });
        return;
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
      }
    }
    try {
      await copyText(`${text}\n${shareLink}`);
      setNotice("Текст и ссылка скопированы");
    } catch {
      setError("Не удалось скопировать ссылку. Попробуйте ещё раз.");
    }
  }

  async function copyCode() {
    if (!created) return;
    try {
      await copyText(created.code);
      setNotice("Код скопирован");
    } catch {
      setError("Не удалось скопировать код. Попробуйте ещё раз.");
    }
  }

  async function revoke() {
    if (!created) return;
    try {
      await revokeInvite(created.id);
      setCreated(null);
      setNotice("Приглашение отозвано");
    } catch (reason) {
      setError(invitationError(reason, "Не удалось отозвать приглашение."));
    }
  }

  async function accept() {
    if (!credential) return;
    setAccepting(true);
    setError(null);
    try {
      const result = await acceptInvite(credential);
      setAccepted(result);
      setPreview((current) => current ? { ...current, already_accepted: true } : current);
      setNotice(
        result.mode === "social"
          ? result.competition_id
            ? "Вы теперь друзья. Соревнование началось"
            : "Вы теперь друзья. Для соревнования настройте тренировочные дни"
          : result.already_accepted ? "Это приглашение уже принято" : "Приглашение принято",
      );
      clearPendingInvite();
      setSearchParams({}, { replace: true });
    } catch (reason) {
      setError(invitationError(reason, "Не удалось принять приглашение."));
    } finally {
      setAccepting(false);
    }
  }

  function submitCode(event: FormEvent) {
    event.preventDefault();
    const value = manualCode.trim();
    if (value.length < 6) return;
    setSearchParams({}, { replace: true });
    void loadPreview(value);
  }

  return (
    <section>
      <Header title="Пригласить друга" subtitle="Тренироваться вместе интереснее" fallbackTo="/more" />

      {notice ? <div role="status" className="mb-4 rounded-2xl bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">{notice}</div> : null}
      {error ? <div role="alert" className="mb-4 rounded-2xl bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300">{error}</div> : null}

      {loadingPreview ? (
        <div className="mb-4 rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">Проверяем приглашение…</div>
      ) : preview ? (
        <div className="mb-4 rounded-2xl bg-tg-secondary p-4">
          <h2 className="font-semibold">Вас приглашает {preview.inviter_label}</h2>
          <p className="mt-2 text-sm leading-relaxed text-tg-hint">
            {preview.mode === "social"
              ? "После подтверждения вы добавите друг друга в друзья и начнёте соревнование на регулярность длительностью 14 дней. Сравнивается только процент тренировок по личному расписанию — вес, замеры и упражнения не раскрываются."
              : "После подтверждения мы сохраним источник приглашения. Дружба и соревнование для нового аккаунта не добавляются автоматически."}
          </p>
          <p className="mt-2 text-xs text-tg-hint">Действует до {formatExpiry(preview.expires_at)}</p>
          <button type="button" onClick={() => void accept()} disabled={accepting || Boolean(accepted)} className="mt-4 min-h-11 w-full rounded-xl bg-tg-button px-4 font-semibold text-tg-button-text disabled:opacity-55">
            {accepted ? "Приглашение принято" : accepting ? "Подтверждаем…" : preview.mode === "social" ? "Добавить друга и начать" : "Принять приглашение"}
          </button>
          {accepted?.mode === "social" ? <Link to="/social" className="mt-2 flex min-h-11 items-center justify-center rounded-xl bg-tg-bg px-4 text-sm font-medium text-tg-link">Открыть друзей и соревнования</Link> : null}
        </div>
      ) : null}

      {!preview && !loadingPreview ? (
        <form onSubmit={submitCode} className="mb-4 rounded-2xl bg-tg-secondary p-4">
          <h2 className="font-semibold">Есть код приглашения?</h2>
          <label className="mt-3 block text-sm text-tg-hint">
            Код
            <input value={manualCode} onChange={(event) => setManualCode(event.target.value.toUpperCase())} placeholder="ABCD-EFGH" autoCapitalize="characters" className="mt-1 min-h-11 w-full rounded-xl bg-tg-bg px-3 text-base uppercase tracking-wider text-tg-text" />
          </label>
          <button type="submit" disabled={manualCode.trim().length < 6} className="mt-3 min-h-11 w-full rounded-xl bg-tg-bg px-4 font-medium text-tg-link disabled:opacity-50">Проверить код</button>
        </form>
      ) : null}

      <div className="rounded-2xl bg-tg-secondary p-4">
        <h2 className="font-semibold">Моё приглашение</h2>
        <p className="mt-2 text-sm leading-relaxed text-tg-hint">
          Ссылка не содержит ваши данные и действует 14 дней. Для существующего пользователя подтверждение добавит вас в друзья и запустит соревнование на регулярность. Для нового пользователя сохранится только источник приглашения.
        </p>
        {!created ? (
          <button type="button" onClick={() => void generate()} disabled={creating} className="mt-4 min-h-11 w-full rounded-xl bg-tg-button px-4 font-semibold text-tg-button-text disabled:opacity-55">
            {creating ? "Создаём…" : "Создать приглашение"}
          </button>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-tg-bg p-3 text-center">
              <p className="text-xs text-tg-hint">Код для ручного ввода</p>
              <p className="mt-1 text-xl font-semibold tracking-[0.18em]">{created.code}</p>
              <p className="mt-1 text-xs text-tg-hint">Действует до {formatExpiry(created.expires_at)}</p>
            </div>
            <button type="button" onClick={() => void share()} className="min-h-11 w-full rounded-xl bg-tg-button px-4 font-semibold text-tg-button-text">Поделиться приглашением</button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void copyCode()} className="min-h-11 rounded-xl bg-tg-bg px-3 text-sm text-tg-link">Скопировать код</button>
              <button type="button" onClick={() => void revoke()} className="min-h-11 rounded-xl bg-tg-bg px-3 text-sm text-red-500">Отозвать</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
