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

  const runFlush = useCallback(async (retryFailed = false) => {
    if (flushingRef.current || !isOnline()) return;
    flushingRef.current = true;
    setSyncing(true);
    try {
      await flushSyncQueue(undefined, { retryFailed });
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
      void runFlush(true);
    };
    void refresh();
    if (isOnline()) void runFlush(true);

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
        className="app-status app-status-warning mb-3"
      >
        <p className="font-semibold">Нет сети</p>
        <p className="mt-0.5 opacity-90">
          Изменения сохраняются на устройстве
          {pending > 0 ? ` (${pending} в очереди)` : ""}. Отправим, когда появится интернет.
        </p>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="app-status app-status-info mb-3"
    >
      <p className="font-medium text-tg-text">
        {syncing ? "Отправляем сохранённые действия…" : "Есть несохранённые на сервер действия"}
      </p>
      <p className="mt-0.5">
        В очереди: {pending}. Можно продолжать — синхронизация идёт в фоне.
      </p>
      {lastError ? (
        <p className="mt-1 break-words text-sm text-[var(--app-warning)]">
          Последняя ошибка: {lastError}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={syncing}
          onClick={() => void runFlush(true)}
          className="app-button app-gradient-action"
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
          className="app-button app-danger-action"
        >
          Очистить очередь
        </button>
      </div>
    </div>
  );
}
