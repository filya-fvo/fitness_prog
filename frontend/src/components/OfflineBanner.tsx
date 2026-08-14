/**
 * Human-readable offline / pending-sync banner (UX review P1).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearSyncQueue,
  flushSyncQueue,
  getPendingCount,
  peekSyncQueue,
} from "@/db/syncQueue";
import { isOnline } from "@/utils/network";
import { confirmAction } from "@/lib/telegram";

export function OfflineBanner() {
  const [online, setOnline] = useState(isOnline());
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const flushingRef = useRef(false);

  const refresh = useCallback(async () => {
    setOnline(isOnline());
    const n = await getPendingCount();
    setPending(n);
    if (n > 0) {
      const items = await peekSyncQueue();
      const err = items.find((i) => i.lastError)?.lastError ?? null;
      setLastError(err);
    } else {
      setLastError(null);
    }
  }, []);

  const runFlush = useCallback(async () => {
    if (flushingRef.current || !isOnline()) return;
    flushingRef.current = true;
    setSyncing(true);
    try {
      await flushSyncQueue();
      await refresh();
    } finally {
      flushingRef.current = false;
      setSyncing(false);
    }
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    const onOffline = () => setOnline(false);
    const onOnline = () => {
      setOnline(true);
      void runFlush();
    };
    void refresh();
    if (isOnline()) void runFlush();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const id = window.setInterval(() => {
      if (cancelled) return;
      void refresh().then(() => {
        if (!cancelled && isOnline()) void runFlush();
      });
    }, 8000);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(id);
    };
  }, [refresh, runFlush]);

  if (online && pending <= 0) return null;

  if (!online) {
    return (
      <div
        role="status"
        className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100"
      >
        <p className="font-semibold">Нет сети</p>
        <p className="mt-0.5 opacity-90">
          Тренировки и подходы сохраняются на устройстве
          {pending > 0 ? ` (${pending} в очереди)` : ""}. Отправим, когда появится интернет.
        </p>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="mb-3 rounded-xl bg-tg-secondary px-3 py-2 text-xs text-tg-hint"
    >
      <p className="font-medium text-tg-text">
        {syncing ? "Отправляем сохранённые действия…" : "Есть несохранённые на сервер действия"}
      </p>
      <p className="mt-0.5">
        В очереди: {pending}. Можно продолжать — синхронизация идёт в фоне.
      </p>
      {lastError ? (
        <p className="mt-1 break-words text-[11px] text-amber-700 dark:text-amber-200">
          Последняя ошибка: {lastError}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={syncing}
          onClick={() => void runFlush()}
          className="rounded-lg bg-tg-button px-2.5 py-1 text-[11px] font-medium text-tg-button-text disabled:opacity-60"
        >
          {syncing ? "Отправляем…" : "Повторить сейчас"}
        </button>
        <button
          type="button"
          disabled={syncing}
          onClick={() => {
            void confirmAction(
              "Удалить очередь локальных действий? Данные на сервере не затронем.",
            ).then((accepted) => {
              if (accepted) void clearSyncQueue().then(() => refresh());
            });
          }}
          className="rounded-lg bg-tg-bg px-2.5 py-1 text-[11px] text-tg-hint disabled:opacity-60"
        >
          Очистить очередь
        </button>
      </div>
    </div>
  );
}
