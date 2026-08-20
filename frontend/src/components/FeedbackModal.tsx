import { useState } from "react";

import { sendFeedback } from "@/api/feedback";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import { isTelegramEnvironment } from "@/lib/telegram";
import { toUserMessage } from "@/utils/errors";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function FeedbackModal({ open, onClose }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const dialogRef = useModalAccessibility(open, onClose);

  if (!open) return null;

  async function submit() {
    const message = text.trim();
    if (message.length < 3 || busy) {
      setError("Напишите хотя бы несколько слов");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await sendFeedback({
        message,
        page: `${window.location.pathname}${window.location.search}`,
        client: isTelegramEnvironment() ? "telegram" : "browser",
        appVersion: import.meta.env.VITE_APP_VERSION || "",
        userAgent: navigator.userAgent,
      });
      setText("");
      setSent(true);
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось отправить сообщение. Попробуйте позже."));
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (busy) return;
    setError(null);
    setSent(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
      onClick={close}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        tabIndex={-1}
        className="w-full max-w-lg rounded-2xl bg-tg-bg p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 id="feedback-title" className="text-lg font-semibold text-tg-text">Обратная связь</h2>
            <p className="mt-1 text-xs text-tg-hint">
              Сообщение будет отправлено администратору вместе со страницей и версией приложения.
            </p>
          </div>
          <button type="button" disabled={busy} className="text-sm text-tg-link disabled:opacity-50" onClick={close}>
            Закрыть
          </button>
        </div>

        {sent ? (
          <div role="status" className="rounded-xl bg-tg-secondary p-4 text-sm text-tg-text">
            Спасибо! Сообщение отправлено администратору.
          </div>
        ) : (
          <>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={5}
              maxLength={3500}
              placeholder="Опишите проблему, идею или вопрос…"
              className="w-full rounded-xl border border-black/10 bg-tg-secondary px-3 py-2 text-sm"
            />
            <p className="mt-1 text-right text-[11px] text-tg-hint">{text.trim().length}/3500</p>
          </>
        )}
        {error ? (
          <div role="alert" className="mt-2 rounded-xl bg-red-500/10 p-2 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        ) : null}
        {!sent ? (
          <button
            type="button"
            disabled={text.trim().length < 3 || busy}
            onClick={() => void submit()}
            className="mt-3 w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-60"
          >
            {busy ? "Отправляем…" : "Отправить администратору"}
          </button>
        ) : (
          <button
            type="button"
            onClick={close}
            className="mt-3 w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text"
          >
            Закрыть
          </button>
        )}
      </div>
    </div>
  );
}
