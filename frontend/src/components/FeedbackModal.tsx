import { useState } from "react";

import { openUserChatWithText } from "@/lib/telegram";

type Props = {
  open: boolean;
  onClose: () => void;
};

const ADMIN_USERNAME =
  String(import.meta.env.VITE_ADMIN_TELEGRAM_USERNAMES || "Filatov_Slava")
    .split(",")[0]
    ?.trim()
    .replace(/^@/, "") || "Filatov_Slava";

export function FeedbackModal({ open, onClose }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function submit() {
    const message = text.trim();
    if (message.length < 3) {
      setError("Напишите хотя бы несколько слов");
      return;
    }
    setError(null);
    // Opens personal chat with admin; user sends from their own account.
    const payload = `Обратная связь из Fitness Mini App\n\n${message}`;
    openUserChatWithText(ADMIN_USERNAME, payload);
    setText("");
    onClose();
  }

  function close() {
    setError(null);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Обратная связь"
      onClick={close}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-tg-bg p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-tg-text">Обратная связь</h2>
            <p className="mt-1 text-xs text-tg-hint">
              Откроется личный чат с @{ADMIN_USERNAME}. Сообщение отправите вы
              сами — оно придёт от вашего аккаунта, не от бота.
            </p>
          </div>
          <button type="button" className="text-sm text-tg-link" onClick={close}>
            Закрыть
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          maxLength={3500}
          placeholder="Опишите проблему, идею или вопрос…"
          className="w-full rounded-xl border border-black/10 bg-tg-secondary px-3 py-2 text-sm"
        />
        <p className="mt-1 text-right text-[11px] text-tg-hint">{text.trim().length}/3500</p>
        {error ? (
          <div className="mt-2 rounded-xl bg-tg-secondary p-2 text-xs text-tg-hint">{error}</div>
        ) : null}
        <button
          type="button"
          disabled={text.trim().length < 3}
          onClick={submit}
          className="mt-3 w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-60"
        >
          Написать Администратору
        </button>
      </div>
    </div>
  );
}
