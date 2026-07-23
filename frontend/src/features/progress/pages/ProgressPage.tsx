import { useEffect, useMemo, useState } from "react";

import { getStoredToken } from "@/api/client";
import { fetchWorkoutHistory } from "@/api/workouts";
import { Header } from "@/components/layout/Header";
import { cacheWorkouts, getPendingCount, readCachedWorkouts } from "@/db/syncQueue";
import { Calendar } from "@/features/progress/pages/Calendar";
import { Charts } from "@/features/progress/pages/Charts";
import type { Workout } from "@/types/workout";
import { isOnline } from "@/utils/network";
import { buildCalendarDays, computeDailyVolume, computeStreak } from "@/utils/progress";

export function ProgressPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"network" | "cache">("network");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const cached = await readCachedWorkouts();
        const queueCount = await getPendingCount();
        if (!cancelled) {
          setPending(queueCount);
        }

        if (getStoredToken() && isOnline()) {
          const items = await fetchWorkoutHistory();
          await cacheWorkouts(items);
          if (!cancelled) {
            setWorkouts(items);
            setSource("network");
          }
        } else if (cached.length) {
          if (!cancelled) {
            setWorkouts(cached);
            setSource("cache");
          }
        } else if (!cancelled) {
          setWorkouts([]);
          setSource(isOnline() ? "network" : "cache");
        }
      } catch (err) {
        const cached = await readCachedWorkouts();
        if (!cancelled) {
          if (cached.length) {
            setWorkouts(cached);
            setSource("cache");
            setError("Сеть недоступна — показан кэш");
          } else {
            setError(err instanceof Error ? err.message : "Не удалось загрузить прогресс");
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const streak = useMemo(() => computeStreak(workouts), [workouts]);
  const series = useMemo(() => computeDailyVolume(workouts, 14), [workouts]);
  const calendarDays = useMemo(
    () => buildCalendarDays(workouts, year, monthIndex),
    [workouts, year, monthIndex],
  );
  const completedCount = workouts.filter((w) => w.status === "completed").length;

  function shiftMonth(delta: number) {
    const d = new Date(year, monthIndex + delta, 1);
    setYear(d.getFullYear());
    setMonthIndex(d.getMonth());
  }

  return (
    <section>
      <Header title="Прогресс" subtitle="Streak, графики и календарь" />

      {loading ? <p className="mb-3 text-sm text-tg-hint">Загрузка…</p> : null}
      {error ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-tg-secondary p-4">
          <p className="text-xs text-tg-hint">Streak</p>
          <p className="mt-1 text-2xl font-semibold">{streak} дн.</p>
        </div>
        <div className="rounded-2xl bg-tg-secondary p-4">
          <p className="text-xs text-tg-hint">Завершено</p>
          <p className="mt-1 text-2xl font-semibold">{completedCount}</p>
        </div>
      </div>

      <p className="mb-3 text-xs text-tg-hint">
        Источник: {source === "network" ? "сервер" : "оффлайн-кэш"}
        {pending > 0 ? ` · в очереди синхронизации: ${pending}` : ""}
      </p>

      <div className="space-y-3">
        <Charts series={series} />
        <Calendar
          year={year}
          monthIndex={monthIndex}
          days={calendarDays}
          onPrev={() => shiftMonth(-1)}
          onNext={() => shiftMonth(1)}
        />
      </div>
    </section>
  );
}
