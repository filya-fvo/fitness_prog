import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  cancelAdminBroadcast,
  copyAdminBroadcast,
  listAdminBroadcasts,
  resumeAdminBroadcast,
  retryAdminBroadcast,
  type AdminBroadcast,
} from "@/api/adminBroadcasts";
import { fetchPrograms } from "@/api/programs";
import { Header } from "@/components/layout/Header";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { useUserStore } from "@/store/userStore";
import type { Program } from "@/types/workout";
import { isAdminUsername } from "@/utils/adminAccess";
import { toUserMessage } from "@/utils/errors";

import { BroadcastEditor } from "../components/BroadcastEditor";
import { BroadcastHistory } from "../components/BroadcastHistory";

const PAGE_SIZE = 10;

export function AdminBroadcastsPage() {
  const user = useUserStore((state) => state.user);
  const isAuthLoading = useUserStore((state) => state.isAuthLoading);
  const allowed = useMemo(() => isAdminUsername(user?.username), [user?.username]);
  const [items, setItems] = useState<AdminBroadcast[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selected, setSelected] = useState<AdminBroadcast | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  const load = useCallback(async (nextOffset: number, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await listAdminBroadcasts(PAGE_SIZE, nextOffset);
      setItems(response.items);
      setTotal(response.total);
      setError(null);
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось загрузить центр рассылок."));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthLoading || !allowed || loaded.current) return;
    loaded.current = true;
    void load(0);
    void fetchPrograms({ templatesOnly: true }).then((response) => setPrograms(response.items)).catch(() => setPrograms([]));
  }, [allowed, isAuthLoading, load]);

  useEffect(() => {
    const active = items.some((item) => ["scheduled", "sending"].includes(item.status));
    if (!allowed || !active) return;
    const timer = window.setInterval(() => void load(offset, true), 3000);
    return () => window.clearInterval(timer);
  }, [allowed, items, load, offset]);

  function mergeCampaign(campaign: AdminBroadcast) {
    setItems((current) => {
      const exists = current.some((item) => item.id === campaign.id);
      return exists
        ? current.map((item) => item.id === campaign.id ? campaign : item)
        : [campaign, ...current].slice(0, PAGE_SIZE);
    });
    setSelected(campaign);
  }

  async function action(run: () => Promise<AdminBroadcast>) {
    setError(null);
    try {
      mergeCampaign(await run());
      await load(offset, true);
    } catch (reason) {
      setError(toUserMessage(reason, "Операция с рассылкой не выполнена."));
      throw reason;
    }
  }

  function move(nextOffset: number) {
    setOffset(nextOffset);
    void load(nextOffset);
  }

  if (isAuthLoading) return <section><Header title="Центр рассылок" subtitle="Проверка доступа…" fallbackTo="/admin" /><PageSkeleton cards={5} /></section>;
  if (!allowed) return <section><Header title="Центр рассылок" subtitle="Доступ ограничен" fallbackTo="/admin" /><div className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">Рассылки доступны только настроенным администраторам.<Link to="/" className="mt-3 block text-center text-tg-link">На главную</Link></div></section>;

  return (
    <section>
      <Header title="Центр рассылок" subtitle="Безопасные Telegram-сообщения выбранной аудитории" fallbackTo="/admin" />
      {error ? <div role="alert" className="mb-4 rounded-2xl bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300">{error}<button type="button" onClick={() => void load(offset)} className="mt-2 block min-h-11 w-full rounded-xl bg-tg-button px-3 font-semibold text-tg-button-text">Повторить загрузку</button></div> : null}
      <BroadcastEditor selected={selected} programs={programs} onChanged={mergeCampaign} />
      <div className="my-5 border-t border-black/10" />
      {loading && !items.length ? <PageSkeleton cards={4} /> : (
        <BroadcastHistory
          items={items}
          loading={loading}
          onCopy={(item) => action(async () => {
            const copied = await copyAdminBroadcast(item.id);
            window.scrollTo({ top: 0, behavior: "smooth" });
            return copied;
          })}
          onRetry={(item) => action(() => retryAdminBroadcast(item.id, item.counts.failed))}
          onResume={(item) => action(() => resumeAdminBroadcast(item.id))}
          onCancel={(item) => action(() => cancelAdminBroadcast(item.id))}
        />
      )}
      {total > PAGE_SIZE ? <div className="mt-3 flex items-center justify-between rounded-2xl bg-tg-secondary p-3 text-xs"><button type="button" disabled={loading || offset === 0} onClick={() => move(Math.max(0, offset - PAGE_SIZE))} className="min-h-11 rounded-xl bg-tg-bg px-4 text-tg-link disabled:opacity-40">Назад</button><span className="text-tg-hint">{offset + 1}–{Math.min(offset + items.length, total)} из {total}</span><button type="button" disabled={loading || offset + items.length >= total} onClick={() => move(offset + PAGE_SIZE)} className="min-h-11 rounded-xl bg-tg-bg px-4 text-tg-link disabled:opacity-40">Дальше</button></div> : null}
    </section>
  );
}
