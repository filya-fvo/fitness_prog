import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { clearAdminUser, deleteAdminUser, type AdminResetScope } from "@/api/admin";
import {
  downloadAdminUserExport,
  resendAdminUserGuide,
  sendAdminUserMessage,
  toggleAdminUserNotifications,
} from "@/api/adminUser";
import { confirmAction } from "@/lib/telegram";
import { toUserMessage } from "@/utils/errors";

import { clearCurrentUserLocalData } from "../adminLocalCleanup";

type Props = {
  userId: string;
  displayName: string;
  currentUserId?: string;
  telegramAvailable: boolean;
  remindersEnabled: boolean | null;
  onCommunicationsChanged: () => Promise<void>;
  onDataChanged: () => Promise<void>;
};

export function AdminUserActions({
  userId,
  displayName,
  currentUserId,
  telegramAvailable,
  remindersEnabled,
  onCommunicationsChanged,
  onDataChanged,
}: Props) {
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [scope, setScope] = useState<AdminResetScope>("workouts");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function perform(key: string, action: () => Promise<string>) {
    setBusy(key);
    setNotice(null);
    setError(null);
    try {
      setNotice(await action());
    } catch (actionError) {
      setError(toUserMessage(actionError, "Действие не выполнено"));
    } finally {
      setBusy(null);
    }
  }

  function sendMessage() {
    const text = message.trim();
    if (!text) return;
    void perform("message", async () => {
      await sendAdminUserMessage(userId, text);
      setMessage("");
      await onCommunicationsChanged();
      return "Сообщение отправлено.";
    });
  }

  function resend(kind: "start" | "guide") {
    void perform(kind, async () => {
      await resendAdminUserGuide(userId, kind);
      await onCommunicationsChanged();
      return kind === "start" ? "Стартовые инструкции отправлены." : "Руководство отправлено.";
    });
  }

  async function toggleReminders() {
    if (remindersEnabled == null) return;
    const next = !remindersEnabled;
    const accepted = await confirmAction(
      `${next ? "Включить" : "Выключить"} все напоминания для «${displayName}»?\nПодтверждайте только если пользователь явно попросил об этом.`,
    );
    if (!accepted) return;
    void perform("notifications", async () => {
      await toggleAdminUserNotifications(userId, next);
      await onCommunicationsChanged();
      return `Напоминания ${next ? "включены" : "выключены"}.`;
    });
  }

  async function clearData() {
    const accepted = await confirmAction(
      `Очистить раздел «${scope}» у пользователя «${displayName}»?`,
    );
    if (!accepted) return;
    if (scope === "all" && !await confirmAction("Полностью очистить профиль и дневники? Это необратимо.")) return;
    void perform("clear", async () => {
      await clearAdminUser(userId, scope, true);
      if (userId === currentUserId) await clearCurrentUserLocalData(scope);
      await onDataChanged();
      return "Выбранные данные очищены.";
    });
  }

  function exportData() {
    void perform("export", async () => {
      const blob = await downloadAdminUserExport(userId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `fitness-user-${userId.slice(0, 8)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      return "Экспорт подготовлен.";
    });
  }

  async function archiveUser() {
    if (!await confirmAction(`Переместить «${displayName}» в архив и очистить его данные?`)) return;
    if (!await confirmAction("Подтвердите архивирование ещё раз. Действие необратимо.")) return;
    void perform("archive", async () => {
      await deleteAdminUser(userId, true);
      navigate("/admin", { replace: true });
      return "Пользователь перемещён в архив.";
    });
  }

  const disabled = busy !== null;
  return (
    <div className="space-y-4">
      {notice ? <p className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p> : null}

      <section className="rounded-2xl bg-tg-secondary p-4">
        <h2 className="font-semibold">Связаться</h2>
        <textarea
          value={message}
          maxLength={1000}
          rows={3}
          disabled={!telegramAvailable || disabled}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={telegramAvailable ? "Служебное сообщение пользователю" : "Telegram не подключён"}
          className="mt-3 w-full rounded-xl border border-black/10 bg-tg-bg p-3 text-base"
        />
        <button type="button" disabled={!telegramAvailable || disabled || !message.trim()} onClick={sendMessage} className="mt-2 min-h-11 w-full rounded-xl bg-tg-button px-4 font-semibold text-tg-button-text disabled:opacity-40">
          {busy === "message" ? "Отправка…" : "Отправить сообщение"}
        </button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" disabled={!telegramAvailable || disabled} onClick={() => resend("start")} className="min-h-11 rounded-xl bg-tg-bg px-3 text-sm text-tg-link disabled:opacity-40">Повторить /start</button>
          <button type="button" disabled={!telegramAvailable || disabled} onClick={() => resend("guide")} className="min-h-11 rounded-xl bg-tg-bg px-3 text-sm text-tg-link disabled:opacity-40">Отправить гайд</button>
        </div>
        <button type="button" disabled={disabled || remindersEnabled == null} onClick={() => void toggleReminders()} className="mt-2 min-h-11 w-full rounded-xl bg-tg-bg px-3 text-sm text-tg-link disabled:opacity-40">
          {remindersEnabled == null ? "Сначала загрузите настройки связи" : `${remindersEnabled ? "Выключить" : "Включить"} все напоминания`}
        </button>
      </section>

      <section className="rounded-2xl border border-red-500/30 bg-tg-secondary p-4">
        <h2 className="font-semibold text-red-600 dark:text-red-300">Данные и архив</h2>
        <button type="button" disabled={disabled} onClick={exportData} className="mt-3 min-h-11 w-full rounded-xl bg-tg-bg px-3 text-sm text-tg-link disabled:opacity-40">Скачать данные JSON</button>
        <div className="mt-2 flex gap-2">
          <select value={scope} disabled={disabled} onChange={(event) => setScope(event.target.value as AdminResetScope)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-black/10 bg-tg-bg px-3 text-base">
            <option value="workouts">Тренировки</option>
            <option value="nutrition">Питание</option>
            <option value="measurements">Замеры</option>
            <option value="all">Все данные</option>
          </select>
          <button type="button" disabled={disabled} onClick={() => void clearData()} className="min-h-11 rounded-xl bg-red-500/10 px-3 text-sm text-red-600 disabled:opacity-40">Очистить</button>
        </div>
        <button type="button" disabled={disabled || userId === currentUserId} onClick={() => void archiveUser()} className="mt-2 min-h-11 w-full rounded-xl bg-red-600 px-3 text-sm font-semibold text-white disabled:opacity-40">
          {userId === currentUserId ? "Свой аккаунт архивировать нельзя" : "Архивировать пользователя"}
        </button>
      </section>
    </div>
  );
}
