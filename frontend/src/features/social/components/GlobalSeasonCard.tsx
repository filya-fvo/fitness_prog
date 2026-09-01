import axios from "axios";
import { useCallback, useEffect, useState } from "react";

import {
  getGlobalSeason,
  joinGlobalSeason,
  leaveGlobalSeason,
  type GlobalSeason,
} from "@/api/social";
import { toUserMessage } from "@/utils/errors";

function actionError(error: unknown): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.detail === "string") {
    return error.response.data.detail;
  }
  return toUserMessage(error, "Не удалось загрузить сезон. Попробуйте ещё раз.");
}

function formatDay(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function PersonalScore({ season }: { season: GlobalSeason }) {
  if (!season.my_score || season.my_score.score === null) {
    return (
      <p className="mt-3 rounded-xl bg-tg-bg p-3 text-sm text-tg-hint">
        Личный результат появится после первого планового тренировочного дня.
      </p>
    );
  }
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <div className="rounded-xl bg-tg-bg p-3">
        <p className="text-xs text-tg-hint">Ваш результат</p>
        <p className="mt-1 text-2xl font-semibold">{season.my_score.score}%</p>
        <p className="text-xs text-tg-hint">
          {season.my_score.completed} из {season.my_score.planned} по плану
        </p>
      </div>
      <div className="rounded-xl bg-tg-bg p-3">
        <p className="text-xs text-tg-hint">Место</p>
        <p className="mt-1 text-2xl font-semibold">{season.my_rank ? `№ ${season.my_rank}` : "—"}</p>
        <p className="text-xs text-tg-hint">
          {season.ranking_unlocked ? season.cohort_label : "Пока скрыто"}
        </p>
      </div>
    </div>
  );
}

export function GlobalSeasonCard() {
  const [season, setSeason] = useState<GlobalSeason | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSeason(await getGlobalSeason());
    } catch (reason) {
      setError(actionError(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      await joinGlobalSeason();
      await load();
    } catch (reason) {
      setError(actionError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    if (!window.confirm("Выйти из сезона? Вернуться в него до следующего сезона не получится.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await leaveGlobalSeason();
      await load();
    } catch (reason) {
      setError(actionError(reason));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mb-4 rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">
        Загружаем общий сезон…
      </div>
    );
  }

  return (
    <section className="mb-4 rounded-2xl bg-tg-secondary p-4" aria-labelledby="global-season-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-tg-link">Общий сезон</p>
          <h2 id="global-season-title" className="mt-1 font-semibold">
            {season?.title ?? "Регулярность"}
          </h2>
          {season ? (
            <p className="mt-1 text-xs text-tg-hint">
              {formatDay(season.start_date)}–{formatDay(season.end_date)} · {season.cohort_label}
            </p>
          ) : null}
        </div>
        {season?.status === "joined" ? (
          <span className="shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-700 dark:text-emerald-300">
            Вы участвуете
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-tg-hint">
        Сравнивается процент выполненных дней личного плана. В рейтинге виден только случайный псевдоним — без веса, замеров и дневника.
      </p>
      {error ? <p role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">{error}</p> : null}
      {!season ? (
        <button type="button" onClick={() => void load()} className="mt-3 min-h-11 w-full rounded-xl bg-tg-bg px-4 text-sm font-medium text-tg-link">
          Повторить
        </button>
      ) : null}

      {season?.status === "not_joined" ? (
        <>
          {!season.ranked_eligible ? (
            <p className="mt-3 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              Срок входа в рейтинг прошёл. Можно вести личный результат, но место появится только в следующем сезоне.
            </p>
          ) : null}
          <button type="button" disabled={busy} onClick={() => void join()} className="mt-3 min-h-11 w-full rounded-xl bg-tg-button px-4 font-semibold text-tg-button-text disabled:opacity-50">
            {busy ? "Присоединяем…" : "Участвовать в сезоне"}
          </button>
          <p className="mt-2 text-xs leading-relaxed text-tg-hint">
            Нажимая кнопку, вы соглашаетесь показывать псевдоним и агрегированный результат своей группе.
          </p>
        </>
      ) : null}

      {season?.status === "joined" ? (
        <>
          <PersonalScore season={season} />
          {season.provisional ? (
            <p className="mt-3 text-sm text-tg-hint">Место появится после двух плановых тренировочных дней.</p>
          ) : !season.ranking_unlocked ? (
            <p className="mt-3 text-sm text-tg-hint">
              Публичный рейтинг откроется, когда в группе будет не менее {season.minimum_cohort_size} участников. Сейчас: {season.participant_count}.
            </p>
          ) : (
            <ol className="mt-3 space-y-2" aria-label="Рейтинг сезона">
              {season.leaderboard.map((entry) => (
                <li key={entry.alias} className={`flex items-center gap-3 rounded-xl p-3 ${entry.is_me ? "bg-tg-button/10" : "bg-tg-bg"}`}>
                  <span className="w-7 text-sm font-semibold">{entry.rank}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{entry.alias}{entry.is_me ? " · Вы" : ""}</span>
                  <span className="text-sm font-semibold">{entry.score}%</span>
                </li>
              ))}
            </ol>
          )}
          <button type="button" disabled={busy} onClick={() => void leave()} className="mt-3 min-h-11 w-full rounded-xl bg-tg-bg px-4 text-sm text-red-500 disabled:opacity-50">
            Выйти из сезона
          </button>
        </>
      ) : null}

      {season?.status === "left" ? (
        <p className="mt-3 rounded-xl bg-tg-bg p-3 text-sm text-tg-hint">
          Вы вышли из этого сезона. Снова присоединиться можно будет в следующем сезоне.
        </p>
      ) : null}
    </section>
  );
}
