import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  getAdminSupportTicket,
  listAdminSupportTickets,
  replyAdminSupport,
  updateAdminSupportStatus,
  type AdminSupportDetail,
  type AdminSupportTicket,
} from "@/api/adminSupport";
import { supportCategories, supportStatuses, type SupportCategory, type SupportStatus } from "@/api/support";
import { Header } from "@/components/layout/Header";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { categoryLabels, formatSupportDate, statusLabels } from "@/features/support/supportLabels";
import { SupportScreenshot } from "@/features/support/components/SupportScreenshot";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import { useUserStore } from "@/store/userStore";
import { isAdminUsername } from "@/utils/adminAccess";
import { toUserMessage } from "@/utils/errors";

export function AdminSupportPage() {
  const user = useUserStore((state) => state.user);
  const isAuthLoading = useUserStore((state) => state.isAuthLoading);
  const allowed = useMemo(() => isAdminUsername(user?.username), [user?.username]);
  const [items, setItems] = useState<AdminSupportTicket[]>([]);
  const [selected, setSelected] = useState<AdminSupportDetail | null>(null);
  const [statusFilter, setStatusFilter] = useState<SupportStatus | "">("waiting_support");
  const [categoryFilter, setCategoryFilter] = useState<SupportCategory | "">("");
  const [reply, setReply] = useState("");
  const [waiting, setWaiting] = useState(0);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalAccessibility(Boolean(selected), () => setSelected(null));

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await listAdminSupportTickets({
        page,
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
      });
      setItems(response.items);
      setWaiting(response.waiting_support);
      setTotal(response.total);
      setError(null);
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось загрузить обращения."));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [categoryFilter, page, statusFilter]);

  useEffect(() => {
    if (!isAuthLoading && allowed) void load();
  }, [allowed, isAuthLoading, load]);

  async function open(ticketId: string) {
    setError(null);
    try {
      setSelected(await getAdminSupportTicket(ticketId));
      await load(true);
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось открыть обращение."));
    }
  }

  async function sendReply(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !reply.trim()) return;
    setSending(true);
    try {
      await replyAdminSupport(selected.id, reply.trim());
      setReply("");
      await open(selected.id);
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось отправить ответ."));
    } finally {
      setSending(false);
    }
  }

  async function changeStatus(value: SupportStatus) {
    if (!selected) return;
    try {
      setSelected(await updateAdminSupportStatus(selected.id, value));
      await load(true);
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось изменить статус."));
    }
  }

  if (isAuthLoading) return <section><Header title="Поддержка" subtitle="Проверка доступа…" fallbackTo="/admin" /><PageSkeleton cards={5} /></section>;
  if (!allowed) return <section><Header title="Поддержка" subtitle="Доступ ограничен" fallbackTo="/admin" /><div className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">Раздел доступен только администраторам.<Link to="/" className="mt-3 block text-center text-tg-link">На главную</Link></div></section>;

  return (
    <section>
      <Header title="Поддержка" subtitle={`Ждут ответа: ${waiting}`} fallbackTo="/admin" />
      {error ? <div role="alert" className="mb-4 rounded-2xl bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300">{error}<button type="button" onClick={() => void load()} className="mt-2 block text-tg-link">Повторить</button></div> : null}
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-tg-secondary p-3">
        <label className="text-xs text-tg-hint">Статус<select value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value as SupportStatus | ""); }} className="mt-1 min-h-11 w-full rounded-xl bg-tg-bg px-2 text-base text-tg-text"><option value="">Все</option>{supportStatuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label>
        <label className="text-xs text-tg-hint">Категория<select value={categoryFilter} onChange={(event) => { setPage(1); setCategoryFilter(event.target.value as SupportCategory | ""); }} className="mt-1 min-h-11 w-full rounded-xl bg-tg-bg px-2 text-base text-tg-text"><option value="">Все</option>{supportCategories.map((value) => <option key={value} value={value}>{categoryLabels[value]}</option>)}</select></label>
      </div>
      {loading ? <PageSkeleton cards={4} /> : items.length ? <div className="space-y-2">
        {items.map((ticket) => <button key={ticket.id} type="button" onClick={() => void open(ticket.id)} className="min-h-11 w-full rounded-2xl bg-tg-secondary p-4 text-left">
          <div className="flex justify-between gap-2"><span className="font-medium">{ticket.user_label}</span><span className="text-xs text-tg-hint">{formatSupportDate(ticket.last_message_at)}</span></div>
          <div className="mt-1 flex items-center gap-2 text-xs"><span className="text-tg-link">{categoryLabels[ticket.category]}</span>{ticket.unread ? <span className="rounded-full bg-tg-button px-2 py-0.5 text-tg-button-text">Новое</span> : null}</div>
          <p className="mt-2 line-clamp-2 text-sm text-tg-hint">{ticket.last_message_preview}</p>
        </button>)}
      </div> : <div className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">По выбранным фильтрам обращений нет.</div>}
      {total > 30 ? <div className="mt-3 flex items-center justify-between rounded-2xl bg-tg-secondary p-3 text-xs text-tg-hint"><button type="button" disabled={page === 1 || loading} onClick={() => setPage((value) => value - 1)} className="min-h-11 px-3 text-tg-link disabled:opacity-40">Назад</button><span>{(page - 1) * 30 + 1}–{Math.min(page * 30, total)} из {total}</span><button type="button" disabled={page * 30 >= total || loading} onClick={() => setPage((value) => value + 1)} className="min-h-11 px-3 text-tg-link disabled:opacity-40">Дальше</button></div> : null}

      {selected ? <div role="dialog" aria-modal="true" aria-labelledby="admin-support-title" className="fixed inset-0 z-50 flex items-end bg-black/55 sm:items-center sm:justify-center" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
        <div ref={dialogRef} tabIndex={-1} className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-tg-bg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:max-w-xl sm:rounded-3xl">
          <div className="flex items-start justify-between gap-3"><div><h2 id="admin-support-title" className="font-semibold">{selected.user_label}</h2><p className="text-xs text-tg-hint">{categoryLabels[selected.category]} · {selected.source_page || "страница не указана"}</p><p className="mt-1 text-xs text-tg-hint">{selected.client === "telegram" ? "Telegram" : "Браузер"}{selected.app_version ? ` · ${selected.app_version}` : ""}</p></div><button type="button" onClick={() => setSelected(null)} className="min-h-11 min-w-11 rounded-xl bg-tg-secondary" aria-label="Закрыть">×</button></div>
          <label className="mt-3 block text-xs text-tg-hint">Статус<select value={selected.status} onChange={(event) => void changeStatus(event.target.value as SupportStatus)} className="mt-1 min-h-11 w-full rounded-xl bg-tg-secondary px-3 text-base text-tg-text">{supportStatuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label>
          <div className="my-4 space-y-3">{selected.messages.map((message) => {
            const fromAdmin = message.author_type === "admin";
            const delivery = message.delivery_status === "sent" ? "Telegram: доставлено" : message.delivery_status === "pending" ? "Telegram: в очереди" : message.delivery_status === "failed" ? "Telegram: ошибка" : message.delivery_status === "unavailable" ? "только в приложении" : "";
            return <article key={message.id} className={`max-w-[92%] rounded-2xl p-3 ${fromAdmin ? "ml-auto bg-tg-button text-tg-button-text" : "bg-tg-secondary"}`}><p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>{message.attachments.map((attachment) => <SupportScreenshot key={attachment.id} attachment={attachment} />)}<p className={`mt-2 text-xs ${fromAdmin ? "opacity-75" : "text-tg-hint"}`}>{fromAdmin ? "Поддержка Fitness Trainer" : selected.user_label} · {formatSupportDate(message.created_at)}{fromAdmin && delivery ? ` · ${delivery}` : ""}</p></article>;
          })}</div>
          {selected.status !== "closed" ? <form onSubmit={sendReply} className="space-y-2"><textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={4} maxLength={3500} aria-label="Ответ пользователю" placeholder="Ответ от имени Поддержки Fitness Trainer…" className="w-full rounded-xl bg-tg-secondary p-3 text-base text-tg-text" /><button type="submit" disabled={sending || !reply.trim()} className="min-h-11 w-full rounded-xl bg-tg-button px-4 font-semibold text-tg-button-text disabled:opacity-50">{sending ? "Отправляем…" : "Ответить"}</button></form> : null}
        </div>
      </div> : null}
    </section>
  );
}
