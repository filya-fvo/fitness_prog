import { useState } from "react";

import type { AdminBroadcast } from "@/api/adminBroadcasts";

type Props = {
  items: AdminBroadcast[];
  loading: boolean;
  onCopy: (item: AdminBroadcast) => Promise<void>;
  onRetry: (item: AdminBroadcast) => Promise<void>;
  onResume: (item: AdminBroadcast) => Promise<void>;
  onCancel: (item: AdminBroadcast) => Promise<void>;
};

const STATUS_LABELS: Record<AdminBroadcast["status"], string> = {
  draft: "Черновик",
  tested: "Тест пройден",
  scheduled: "Ожидает",
  sending: "Отправляется",
  completed: "Завершена",
  cancelled: "Отменена",
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" });

function formatScheduled(item: AdminBroadcast): string {
  if (!item.scheduled_at) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: item.scheduled_timezone,
  }).format(new Date(item.scheduled_at));
}

const REASON_LABELS: Record<AdminBroadcast["failure_reasons"][number]["code"], string> = {
  telegram_unavailable: "Бот заблокирован или чат недоступен",
  telegram_transport: "Временная ошибка сети Telegram",
  telegram_api: "Ошибка Telegram API",
  worker_recovered: "Доставка восстановлена после перезапуска",
  unknown: "Неизвестная безопасная причина",
};

export function BroadcastHistory({ items, loading, onCopy, onRetry, onResume, onCancel }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelConfirming, setCancelConfirming] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    try {
      await action();
      setConfirming(null);
      setChecked(false);
      setText("");
      setCancelConfirming(null);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="font-semibold">История рассылок</h2><p className="text-xs text-tg-hint">Прогресс обновляется автоматически</p></div>
        {loading ? <span className="text-xs text-tg-hint">Обновляем…</span> : null}
      </div>
      {!loading && items.length === 0 ? <p className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">Рассылок пока нет.</p> : null}
      {items.map((item) => {
        const processed = item.counts.sent + item.counts.failed + item.counts.skipped + item.counts.cancelled;
        const progress = item.counts.expected ? Math.round((processed / item.counts.expected) * 100) : 0;
        const retryText = `ПОВТОРИТЬ ${item.counts.failed}`;
        return (
          <article key={item.id} className="rounded-2xl bg-tg-secondary p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h3 className="truncate text-sm font-semibold">{item.title}</h3><p className="mt-1 text-xs text-tg-hint">{dateFormatter.format(new Date(item.created_at))} · {STATUS_LABELS[item.status]}</p></div>
              <span className="shrink-0 rounded-full bg-tg-bg px-2.5 py-1 text-[11px] font-semibold">{progress}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-tg-bg"><div className="h-full rounded-full bg-tg-button transition-[width]" style={{ width: `${progress}%` }} /></div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
              <div className="rounded-lg bg-tg-bg p-2"><dt className="text-tg-hint">Ожидает</dt><dd className="font-semibold">{item.counts.pending + item.counts.sending}</dd></div>
              <div className="rounded-lg bg-tg-bg p-2"><dt className="text-tg-hint">Доставлено</dt><dd className="font-semibold text-emerald-600">{item.counts.sent}</dd></div>
              <div className="rounded-lg bg-tg-bg p-2"><dt className="text-tg-hint">Ошибка</dt><dd className="font-semibold text-red-500">{item.counts.failed}</dd></div>
              <div className="rounded-lg bg-tg-bg p-2"><dt className="text-tg-hint">Пропущено</dt><dd className="font-semibold">{item.counts.skipped}</dd></div>
              <div className="rounded-lg bg-tg-bg p-2"><dt className="text-tg-hint">Отменено</dt><dd className="font-semibold">{item.counts.cancelled}</dd></div>
              <div className="rounded-lg bg-tg-bg p-2"><dt className="text-tg-hint">Всего</dt><dd className="font-semibold">{item.counts.expected}</dd></div>
            </dl>
            {item.scheduled_at ? <p className="mt-3 text-xs text-tg-hint">Отправка: {formatScheduled(item)} · {item.scheduled_timezone}</p> : null}
            {item.failure_reasons.length ? (
              <ul className="mt-3 space-y-1 rounded-xl bg-tg-bg p-3 text-xs text-tg-hint" aria-label="Причины недоставки">
                {item.failure_reasons.map((reason) => <li key={`${reason.status}-${reason.code}`}>{REASON_LABELS[reason.code]}: <strong className="text-tg-text">{reason.count}</strong></li>)}
              </ul>
            ) : null}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button type="button" disabled={Boolean(busy)} onClick={() => void run(`copy-${item.id}`, () => onCopy(item))} className="min-h-11 rounded-xl bg-tg-bg px-3 text-sm font-medium text-tg-link disabled:opacity-40">{busy === `copy-${item.id}` ? "Копируем…" : "Копировать как черновик"}</button>
              {item.status === "scheduled" ? <button type="button" disabled={Boolean(busy)} onClick={() => void run(`resume-${item.id}`, () => onResume(item))} className="min-h-11 rounded-xl bg-tg-bg px-3 text-sm font-medium text-tg-link disabled:opacity-40">Возобновить очередь</button> : null}
              {item.status === "scheduled" ? <button type="button" disabled={Boolean(busy)} onClick={() => setCancelConfirming(item.id)} className="min-h-11 rounded-xl bg-red-500/10 px-3 text-sm font-semibold text-red-600 disabled:opacity-40">Отменить рассылку</button> : null}
              {item.status === "completed" && item.counts.failed > 0 ? <button type="button" disabled={Boolean(busy)} onClick={() => { setConfirming(item.id); setChecked(false); setText(""); }} className="min-h-11 rounded-xl bg-amber-600 px-3 text-sm font-semibold text-white disabled:opacity-40">Повторить ошибки</button> : null}
            </div>
            {cancelConfirming === item.id ? (
              <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3">
                <p className="text-sm">Рассылка ещё не началась. После отмены ожидающие сообщения не будут отправлены.</p>
                <div className="mt-3 flex gap-2"><button type="button" onClick={() => setCancelConfirming(null)} className="min-h-11 flex-1 rounded-xl bg-tg-bg px-3 text-sm">Назад</button><button type="button" disabled={Boolean(busy)} onClick={() => void run(`cancel-${item.id}`, () => onCancel(item))} className="min-h-11 flex-1 rounded-xl bg-red-600 px-3 text-sm font-semibold text-white disabled:opacity-40">Подтвердить отмену</button></div>
              </div>
            ) : null}
            {confirming === item.id ? (
              <div className="mt-3 space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="h-5 w-5" />Повторить только {item.counts.failed} неуспешных отправок</label>
                <label className="block text-xs text-tg-hint">Введите <strong>{retryText}</strong><input value={text} onChange={(event) => setText(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 text-base" /></label>
                <div className="flex gap-2"><button type="button" onClick={() => setConfirming(null)} className="min-h-11 flex-1 rounded-xl bg-tg-bg px-3 text-sm">Отмена</button><button type="button" disabled={!checked || text !== retryText || Boolean(busy)} onClick={() => void run(`retry-${item.id}`, () => onRetry(item))} className="min-h-11 flex-1 rounded-xl bg-red-600 px-3 text-sm font-semibold text-white disabled:opacity-40">Повторить</button></div>
              </div>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
