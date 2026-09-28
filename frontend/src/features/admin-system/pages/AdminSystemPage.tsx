import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  checkAdminSystemStatus,
  fetchAdminSystemStatus,
  type AdminSystemCheck,
  type AdminSystemFact,
  type AdminSystemStatus,
} from "@/api/adminSystem";
import { Header } from "@/components/layout/Header";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { useUserStore } from "@/store/userStore";
import { isAdminUsername } from "@/utils/adminAccess";
import { toUserMessage } from "@/utils/errors";

import { adminSystemLoadReducer, initialAdminSystemState } from "../adminSystemState";
import { SystemStatusHistory } from "../components/SystemStatusHistory";

const AUTO_REFRESH_MS = 30_000;

const STATUS_PRESENTATION: Record<
  AdminSystemStatus,
  { label: string; badge: string; card: string }
> = {
  normal: {
    label: "Норма",
    badge: "app-chip-success",
    card: "app-card-success",
  },
  attention: {
    label: "Требует внимания",
    badge: "app-chip-warning",
    card: "app-card-warning",
  },
  error: {
    label: "Ошибка",
    badge: "app-chip-danger",
    card: "app-card-danger",
  },
  no_data: {
    label: "Нет данных",
    badge: "app-chip-neutral",
    card: "app-card-neutral",
  },
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Нет данных" : dateFormatter.format(parsed);
}

function formatFact(fact: AdminSystemFact): string {
  return fact.kind === "datetime" ? formatDate(fact.value) : fact.value;
}

function SystemStatusCard({ item }: { item: AdminSystemCheck }) {
  const presentation = STATUS_PRESENTATION[item.status];
  return (
    <article className={`app-card p-4 ${presentation.card}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold text-tg-text">{item.title}</h2>
        <span className={`app-chip shrink-0 ${presentation.badge}`}>
          {presentation.label}
        </span>
      </div>
      <p className="mt-2 text-sm text-tg-text">{item.summary}</p>
      {item.facts.length ? (
        <dl className="mt-3 grid gap-2 text-xs">
          {item.facts.map((fact) => (
            <div key={`${fact.label}-${fact.value}`} className="flex justify-between gap-3">
              <dt className="text-tg-hint">{fact.label}</dt>
              <dd className="text-right font-medium text-tg-text">{formatFact(fact)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="mt-3 border-t border-black/10 pt-3 text-xs text-tg-hint">
        Следующий шаг: {item.next_step}
      </p>
    </article>
  );
}

export function AdminSystemPage() {
  const user = useUserStore((state) => state.user);
  const isAuthLoading = useUserStore((state) => state.isAuthLoading);
  const allowed = useMemo(() => isAdminUsername(user?.username), [user?.username]);
  const [state, dispatch] = useReducer(adminSystemLoadReducer, initialAdminSystemState);
  const initialLoadStarted = useRef(false);
  const refreshInFlight = useRef(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const load = useCallback(async () => {
    dispatch({ type: "load" });
    try {
      const data = await checkAdminSystemStatus();
      dispatch({ type: "success", data });
    } catch (error) {
      dispatch({
        type: "failure",
        error: toUserMessage(error, "Не удалось проверить состояние системы."),
      });
    }
  }, []);

  const refreshLive = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setRefreshing(true);
    try {
      const data = await fetchAdminSystemStatus();
      dispatch({ type: "success", data });
      setRefreshError(null);
    } catch (error) {
      setRefreshError(toUserMessage(error, "Автообновление временно недоступно."));
    } finally {
      refreshInFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthLoading && allowed && !initialLoadStarted.current) {
      initialLoadStarted.current = true;
      void load();
    }
  }, [allowed, isAuthLoading, load]);

  useEffect(() => {
    if (isAuthLoading || !allowed || !autoRefresh || state.phase !== "ready") return;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshLive();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [allowed, autoRefresh, isAuthLoading, refreshLive, state.phase]);

  if (isAuthLoading) {
    return (
      <section>
        <Header title="Состояние системы" subtitle="Проверка доступа…" fallbackTo="/admin" />
        <PageSkeleton cards={4} />
      </section>
    );
  }

  if (!allowed) {
    return (
      <section>
        <Header title="Состояние системы" subtitle="Доступ ограничен" fallbackTo="/admin" />
        <div className="app-card app-card-inset p-4 text-sm text-tg-hint">
          Системные данные доступны только настроенным администраторам.
          <Link to="/" className="mt-3 block text-center text-tg-link">На главную</Link>
        </div>
      </section>
    );
  }

  return (
    <section>
      <Header
        title="Состояние системы"
        subtitle="Безопасная диагностика API, хранилищ и фоновых задач"
        fallbackTo="/admin"
      />

      {state.phase === "loading" ? <PageSkeleton cards={6} /> : null}

      {state.phase === "error" ? (
        <div role="alert" className="app-status app-status-danger">
          <p className="text-sm text-tg-text">{state.error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 min-h-11 w-full rounded-xl app-gradient-action px-4 py-3 text-sm font-semibold"
          >
            Повторить проверку
          </button>
        </div>
      ) : null}

      {state.phase === "ready" ? (
        <>
          {refreshError ? <p role="alert" className="app-status app-status-warning mb-3">{refreshError}</p> : null}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 app-card app-card-inset p-4">
            <div>
              <p className="text-sm font-semibold text-tg-text">
                Общий статус: {STATUS_PRESENTATION[state.data.overall_status].label}
              </p>
              <p className="mt-1 text-xs text-tg-hint">
                Проверено {formatDate(state.data.checked_at)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={autoRefresh}
                onClick={() => setAutoRefresh((value) => !value)}
                className="min-h-11 rounded-xl bg-tg-bg px-3 py-2 text-xs font-medium text-tg-link"
              >
                Автообновление: {autoRefresh ? "включено" : "выключено"}
              </button>
              <button
                type="button"
                disabled={refreshing}
                onClick={() => void load()}
                className="min-h-11 rounded-xl app-gradient-action px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {refreshing ? "Обновляем…" : "Проверить снова"}
              </button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {state.data.items.map((item) => <SystemStatusCard key={item.key} item={item} />)}
          </div>
          <SystemStatusHistory />
        </>
      ) : null}
    </section>
  );
}
