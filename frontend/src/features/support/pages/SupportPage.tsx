import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import {
  createSupportTicket,
  listSupportTickets,
  supportCategories,
  uploadSupportScreenshot,
  type SupportCategory,
  type SupportTicketSummary,
} from "@/api/support";
import { Header } from "@/components/layout/Header";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { toUserMessage } from "@/utils/errors";

import { categoryLabels, formatSupportDate, statusLabels } from "../supportLabels";
import { prepareSupportScreenshot } from "../supportScreenshot";

export function SupportPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState<SupportTicketSummary[]>([]);
  const [category, setCategory] = useState<SupportCategory>("question");
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setItems(await listSupportTickets());
      setError(null);
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось загрузить обращения."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (message.trim().length < 3) return;
    setSending(true);
    setError(null);
    try {
      const prepared = screenshot ? await prepareSupportScreenshot(screenshot) : null;
      const ticket = await createSupportTicket({ category, message: message.trim(), page: location.state?.from || "" });
      if (prepared) {
        try {
          await uploadSupportScreenshot(ticket.id, prepared);
        } catch (reason) {
          navigate(`/support/${ticket.id}`, {
            state: { uploadError: toUserMessage(reason, "Обращение создано, но скриншот не загрузился. Прикрепите его повторно.") },
          });
          return;
        }
      }
      navigate(`/support/${ticket.id}`);
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось отправить обращение."));
    } finally {
      setSending(false);
    }
  }

  return (
    <section>
      <Header title="Поддержка" subtitle="Переписка внутри приложения" fallbackTo="/more" />
      <div className="mb-4 rounded-2xl bg-tg-secondary p-4 text-sm leading-relaxed text-tg-hint">
        Ответ придёт сюда. Если аккаунт связан с Telegram, бот также пришлёт уведомление. Личный аккаунт сотрудника не показывается.
      </div>
      <form onSubmit={submit} className="mb-5 space-y-3 rounded-2xl bg-tg-secondary p-4">
        <h2 className="font-semibold">Новое обращение</h2>
        <label className="block text-sm text-tg-hint">
          Тема
          <select value={category} onChange={(event) => setCategory(event.target.value as SupportCategory)} className="mt-1 min-h-11 w-full rounded-xl bg-tg-bg px-3 text-base text-tg-text">
            {supportCategories.map((value) => <option key={value} value={value}>{categoryLabels[value]}</option>)}
          </select>
        </label>
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl bg-tg-bg px-3 text-sm text-tg-link">
          <span>{screenshot ? "Заменить скриншот" : "Прикрепить скриншот"}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/*" onChange={(event) => setScreenshot(event.target.files?.[0] ?? null)} className="sr-only" />
        </label>
        <p className="text-xs text-tg-hint">JPEG, PNG или WebP, до 8 МБ.</p>
        {screenshot ? <div className="flex items-center justify-between gap-2 text-xs text-tg-hint"><span className="truncate">{screenshot.name}</span><button type="button" onClick={() => setScreenshot(null)} className="min-h-11 px-2 text-tg-link">Убрать</button></div> : null}
        <label className="block text-sm text-tg-hint">
          Сообщение
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={3500} rows={5} placeholder="Опишите, что произошло или что хотите узнать" className="mt-1 w-full rounded-xl bg-tg-bg p-3 text-base text-tg-text" />
        </label>
        <button type="submit" disabled={sending || message.trim().length < 3} className="min-h-11 w-full rounded-xl bg-tg-button px-4 font-semibold text-tg-button-text disabled:opacity-50">
          {sending ? "Отправляем…" : "Отправить в поддержку"}
        </button>
      </form>
      {error ? <div role="alert" className="mb-4 rounded-2xl bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300">{error}<button type="button" onClick={() => void load()} className="mt-2 block text-tg-link">Повторить загрузку</button></div> : null}
      <h2 className="mb-2 font-semibold">Мои обращения</h2>
      {loading ? <PageSkeleton cards={3} /> : items.length ? (
        <div className="space-y-3">
          {items.map((ticket) => (
            <Link key={ticket.id} to={`/support/${ticket.id}`} className="block rounded-2xl bg-tg-secondary p-4">
              <div className="flex items-start justify-between gap-3"><span className="font-medium">{categoryLabels[ticket.category]}</span>{ticket.unread ? <span className="rounded-full bg-tg-button px-2 py-1 text-xs text-tg-button-text">Новый ответ</span> : null}</div>
              <p className="mt-1 line-clamp-2 text-sm text-tg-hint">{ticket.last_message_preview}</p>
              <div className="mt-3 flex justify-between gap-2 text-xs text-tg-hint"><span>{statusLabels[ticket.status]}</span><span>{formatSupportDate(ticket.last_message_at)}</span></div>
            </Link>
          ))}
        </div>
      ) : <div className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">Обращений пока нет.</div>}
    </section>
  );
}
