import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getStoredToken } from "@/api/client";
import { fetchNutritionRange } from "@/api/nutrition";
import { fetchWorkoutHistory } from "@/api/workouts";
import { Header } from "@/components/layout/Header";
import { cacheWorkouts, getPendingCount, readCachedWorkouts } from "@/db/syncQueue";
import { Calendar } from "@/features/progress/pages/Calendar";
import { Charts } from "@/features/progress/pages/Charts";
import { NutritionBalanceChart } from "@/features/progress/pages/NutritionBalanceChart";
import type { Workout } from "@/types/workout";
import { isOnline } from "@/utils/network";
import {
  buildCalendarDays,
  buildNutritionBalance,
  computeDailyVolume,
  computeStreak,
  groupNutritionByWeek,
  summarizeNutritionPeriods,
  type NutritionBalanceSummary,
} from "@/utils/progress";

type NutritionRangeMode = "day" | "week";

export function ProgressPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"network" | "cache">("network");
  const [nutritionMode, setNutritionMode] = useState<NutritionRangeMode>("day");
  const [nutrition, setNutrition] = useState<NutritionBalanceSummary | null>(null);
  const [nutritionError, setNutritionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setNutritionError(null);
      try {
        const cached = await readCachedWorkouts();
        const queueCount = await getPendingCount();
        if (!cancelled) setPending(queueCount);

        if (getStoredToken() && isOnline()) {
          // Up to 31 days covers current month (API max)
          const [items, range] = await Promise.all([
            fetchWorkoutHistory(),
            fetchNutritionRange({ days: 31 }).catch((err: unknown) => {
              if (!cancelled) {
                setNutritionError(
                  err instanceof Error ? err.message : "Не удалось загрузить питание",
                );
              }
              return null;
            }),
          ]);
          await cacheWorkouts(items);
          if (!cancelled) {
            setWorkouts(items);
            setSource("network");
            if (range) setNutrition(buildNutritionBalance(range));
          }
        } else if (cached.length) {
          if (!cancelled) {
            setWorkouts(cached);
            setSource("cache");
            setNutritionError("Питание доступно только онлайн");
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
        if (!cancelled) setLoading(false);
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

  const nutritionSeries = useMemo(() => {
    if (!nutrition) return [];
    if (nutritionMode === "week") return groupNutritionByWeek(nutrition.days);
    // last 14 days for readable day chart
    return nutrition.days.slice(-14);
  }, [nutrition, nutritionMode]);

  const nutritionPeriods = useMemo(() => {
    if (!nutrition) return null;
    return summarizeNutritionPeriods(nutrition.days, nutrition.dailyTarget);
  }, [nutrition]);

  function shiftMonth(delta: number) {
    const d = new Date(year, monthIndex + delta, 1);
    setYear(d.getFullYear());
    setMonthIndex(d.getMonth());
  }

  return (
    <section>
      <Header title="Прогресс" subtitle="Тренировки, питание и календарь" />

      {loading ? <p className="mb-3 text-sm text-tg-hint">Загрузка…</p> : null}
      {error ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-tg-secondary p-4">
          <p className="text-xs text-tg-hint">Streak тренировок</p>
          <p className="mt-1 text-2xl font-semibold">{streak} дн.</p>
          <p className="mt-1 text-[11px] text-tg-hint">Подряд с завершёнными тренировками</p>
        </div>
        <div className="rounded-2xl bg-tg-secondary p-4">
          <p className="text-xs text-tg-hint">Завершено</p>
          <p className="mt-1 text-2xl font-semibold">{completedCount}</p>
          <p className="mt-1 text-[11px] text-tg-hint">Всего завершённых тренировок</p>
        </div>
      </div>

      <p className="mb-3 text-xs text-tg-hint">
        Источник: {source === "network" ? "сервер" : "оффлайн-кэш"}
        {pending > 0 ? ` · в очереди синхронизации: ${pending}` : ""}
      </p>

      <div className="space-y-3">
        <div className="rounded-2xl bg-tg-secondary p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Сводка по питанию</p>
            <div className="flex rounded-full bg-tg-bg p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setNutritionMode("day")}
                className={[
                  "rounded-full px-3 py-1",
                  nutritionMode === "day" ? "bg-tg-button text-tg-button-text" : "text-tg-hint",
                ].join(" ")}
              >
                День
              </button>
              <button
                type="button"
                onClick={() => setNutritionMode("week")}
                className={[
                  "rounded-full px-3 py-1",
                  nutritionMode === "week" ? "bg-tg-button text-tg-button-text" : "text-tg-hint",
                ].join(" ")}
              >
                Неделя
              </button>
            </div>
          </div>
          {nutritionError ? (
            <p className="text-xs text-tg-hint">{nutritionError}</p>
          ) : (
            <NutritionBalanceChart
              mode={nutritionMode}
              series={nutritionSeries}
              dailyTarget={nutrition?.dailyTarget ?? null}
              periods={nutritionPeriods}
            />
          )}
          <Link to="/nutrition" className="mt-2 block text-center text-xs text-tg-link">
            Открыть дневник питания
          </Link>
        </div>

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
