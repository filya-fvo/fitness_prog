import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { closeSupportTicket, getSupportTicket, sendSupportMessage, type SupportTicketDetail } from "@/api/support";
import { Header } from "@/components/layout/Header";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { toUserMessage } from "@/utils/errors";

import { categoryLabels, formatSupportDate, statusLabels } from "../supportLabels";

export function SupportTicketPage() {
  const { ticketId = "" } = useParams();
  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      setTicket(await getSupportTicket(ticketId));
      setError(null);
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось загрузить обращение."));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 20_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function reply(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    try {
      await sendSupportMessage(ticketId, message.trim());
      setMessage("");
      await load(true);
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось отправить сообщение."));
    } finally {
      setSending(false);
    }
  }

  async function closeTicket() {
    if (!window.confirm("Закрыть это обращение?")) return;
    try {
      await closeSupportTicket(ticketId);
      await load(true);
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось закрыть обращение."));
    }
  }

  return (
    <section>
      <Header title="Поддержка Fil Fit" subtitle={ticket ? categoryLabels[ticket.category] : "Обращение"} fallbackTo="/support" />
      {error ? <div role="alert" className="mb-4 rounded-2xl bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300">{error}<button type="button" onClick={() => void load()} className="mt-2 block text-tg-link">Повторить</button></div> : null}
      {loading ? <PageSkeleton cards={4} /> : ticket ? (
        <>
          <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-tg-secondary p-3 text-xs text-tg-hint">
            <span>{statusLabels[ticket.status]}</span><button type="button" onClick={() => void load()} className="min-h-11 px-2 text-tg-link">Обновить</button>
          </div>
          <div aria-live="polite" className="space-y-3">
            {ticket.messages.map((item) => {
              const fromSupport = item.author_type === "admin";
              return <article key={item.id} className={`max-w-[90%] rounded-2xl p-4 ${fromSupport ? "bg-tg-secondary" : "ml-auto bg-tg-button text-tg-button-text"}`}>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.body}</p>
                <p className={`mt-2 text-xs ${fromSupport ? "text-tg-hint" : "opacity-75"}`}>{fromSupport ? "Поддержка Fil Fit" : "Вы"} · {formatSupportDate(item.created_at)}</p>
              </article>;
            })}
          </div>
          {ticket.status !== "closed" ? (
            <form onSubmit={reply} className="mt-4 space-y-3 rounded-2xl bg-tg-secondary p-4">
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={3500} rows={4} aria-label="Сообщение поддержке" placeholder="Написать сообщение…" className="w-full rounded-xl bg-tg-bg p-3 text-base text-tg-text" />
              <button type="submit" disabled={sending || !message.trim()} className="min-h-11 w-full rounded-xl bg-tg-button px-4 font-semibold text-tg-button-text disabled:opacity-50">{sending ? "Отправляем…" : "Отправить"}</button>
              <button type="button" onClick={() => void closeTicket()} className="min-h-11 w-full rounded-xl bg-tg-bg px-4 text-sm text-tg-hint">Закрыть обращение</button>
            </form>
          ) : <div className="mt-4 rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">Обращение закрыто. Создайте новое, если нужна дополнительная помощь.</div>}
        </>
      ) : null}
    </section>
  );
}
