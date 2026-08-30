import { useCallback, useEffect, useState } from "react";

import {
  fetchAdminSystemHistory,
  type AdminSystemHistoryResponse,
  type AdminSystemStatus,
} from "@/api/adminSystem";
import { toUserMessage } from "@/utils/errors";

import { SYSTEM_STATUS_LABELS, summarizeSystemSnapshot } from "../adminSystemHistory";

const INITIAL_VISIBLE_COUNT = 12;
const HISTORY_LIMIT = 672;
const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "short",
  timeStyle: "short",
});

const STATUS_BADGES: Record<AdminSystemStatus, string> = {
  normal: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  attention: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  error: "bg-red-500/15 text-red-700 dark:text-red-300",
  no_data: "bg-slate-500/15 text-tg-hint",
};

type HistoryState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: AdminSystemHistoryResponse };

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Дата неизвестна" : dateFormatter.format(parsed);
}

export function SystemStatusHistory() {
  const [state, setState] = useState<HistoryState>({ phase: "loading" });
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    try {
      const data = await fetchAdminSystemHistory(HISTORY_LIMIT);
      setState({ phase: "ready", data });
      setVisibleCount(INITIAL_VISIBLE_COUNT);
    } catch (error) {
      setState({
        phase: "error",
        message: toUserMessage(error, "Не удалось загрузить историю состояния."),
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="mt-6 rounded-2xl bg-tg-secondary p-4" aria-labelledby="system-history-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="system-history-title" className="font-semibold text-tg-text">
            История состояния
          </h2>
          <p className="mt-1 text-xs text-tg-hint">
            Автоматический снимок каждые 15 минут и ручные проверки.
          </p>
        </div>
        {state.phase !== "loading" ? (
          <button
            type="button"
            onClick={() => void load()}
            className="min-h-11 shrink-0 rounded-xl px-3 text-sm font-medium text-tg-link"
          >
            Обновить
          </button>
        ) : null}
      </div>

      {state.phase === "loading" ? (
        <p className="mt-4 text-sm text-tg-hint" role="status">Загружаем историю…</p>
      ) : null}

      {state.phase === "error" ? (
        <div className="mt-4 rounded-xl border border-red-500/30 p-3" role="alert">
          <p className="text-sm text-tg-text">{state.message}</p>
          <button type="button" onClick={() => void load()} className="mt-2 min-h-11 text-sm text-tg-link">
            Повторить
          </button>
        </div>
      ) : null}

      {state.phase === "ready" && !state.data.snapshots.length ? (
        <p className="mt-4 text-sm text-tg-hint">
          История пока пуста. Текущая проверка станет первой записью.
        </p>
      ) : null}

      {state.phase === "ready" && state.data.snapshots.length ? (
        <>
          <ol className="mt-4 space-y-2">
            {state.data.snapshots.slice(0, visibleCount).map((snapshot) => (
              <li key={snapshot.id} className="rounded-xl border border-black/10 bg-tg-bg p-3">
                <div className="flex items-center justify-between gap-3">
                  <time dateTime={snapshot.captured_at} className="text-xs font-medium text-tg-text">
                    {formatDate(snapshot.captured_at)}
                  </time>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${STATUS_BADGES[snapshot.overall_status]}`}>
                    {SYSTEM_STATUS_LABELS[snapshot.overall_status]}
                  </span>
                </div>
                <p className="mt-2 text-xs text-tg-hint">{summarizeSystemSnapshot(snapshot)}</p>
                <p className="mt-1 text-[11px] text-tg-hint">
                  {snapshot.source === "manual" ? "Ручная проверка" : "Автоматический снимок"}
                </p>
              </li>
            ))}
          </ol>
          {visibleCount < state.data.snapshots.length ? (
            <button
              type="button"
              onClick={() => setVisibleCount((value) => value + INITIAL_VISIBLE_COUNT)}
              className="mt-3 min-h-11 w-full rounded-xl border border-black/10 px-4 text-sm font-medium text-tg-link"
            >
              Показать ещё
            </button>
          ) : null}
          <p className="mt-3 text-[11px] text-tg-hint">
            Показаны снимки примерно за 7 дней; в базе они хранятся {state.data.retention_days} дней.
          </p>
        </>
      ) : null}
    </section>
  );
}
