import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { analyzeProgress } from "@/api/ai";
import { getStoredToken } from "@/api/client";
import { fetchExercises } from "@/api/exercises";
import { fetchNutritionRange } from "@/api/nutrition";
import { fetchWorkoutHistory } from "@/api/workouts";
import { Header } from "@/components/layout/Header";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import {
  cacheExercises,
  cacheWorkouts,
  getPendingCount,
  readCachedExercises,
  readCachedWorkouts,
} from "@/db/syncQueue";
import { Calendar } from "@/features/progress/pages/Calendar";
import { WorkoutDayDetails } from "@/features/progress/pages/WorkoutDayDetails";
import { Charts } from "@/features/progress/pages/Charts";
import { WeeklyOverview } from "@/features/progress/pages/WeeklyOverview";
import { NutritionBalanceChart } from "@/features/progress/pages/NutritionBalanceChart";
import { BadgesPanel } from "@/features/progress/pages/BadgesPanel";
import { StrengthTrends } from "@/features/progress/pages/StrengthTrends";
import { HabitsCheckin } from "@/components/HabitsCheckin";
import type { Exercise, Workout } from "@/types/workout";
import { computeBadges } from "@/utils/achievements";
import { isOnline } from "@/utils/network";
import {
  buildCalendarDays,
  buildNutritionBalance,
  computeDailyVolume,
  computeStreak,
  groupNutritionByWeek,
  summarizeNutritionPeriods,
  type NutritionBalanceSummary,
  workoutDateKey,
} from "@/utils/progress";
import { buildLiftTrends } from "@/utils/strengthProgress";
import { buildWeeklyWorkoutOverview } from "@/utils/weeklyOverview";
import { toUserMessage } from "@/utils/errors";

type NutritionRangeMode = "day" | "week";

export function ProgressPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"network" | "cache">("network");
  const [nutritionMode, setNutritionMode] = useState<NutritionRangeMode>("day");
  const [nutrition, setNutrition] = useState<NutritionBalanceSummary | null>(null);
  const [nutritionError, setNutritionError] = useState<string | null>(null);
  const [weekAiBusy, setWeekAiBusy] = useState(false);
  const [weekAiText, setWeekAiText] = useState<string | null>(null);
  const [weekAiError, setWeekAiError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setNutritionError(null);
      try {
        const cached = await readCachedWorkouts();
        const cachedEx = await readCachedExercises();
        const queueCount = await getPendingCount();
        if (!cancelled) {
          setPending(queueCount);
          if (cachedEx.length) setCatalog(cachedEx);
        }

        if (getStoredToken() && isOnline()) {
          // Up to 31 days covers current month (API max)
          const [items, range, ex] = await Promise.all([
            fetchWorkoutHistory(),
            fetchNutritionRange({ days: 31 }).catch((err: unknown) => {
              if (!cancelled) {
                setNutritionError(
                  toUserMessage(err, "Не удалось загрузить питание"),
                );
              }
              return null;
            }),
            fetchExercises({ pageSize: 200 }).catch(() => null),
          ]);
          await cacheWorkouts(items);
          if (ex?.items?.length) {
            await cacheExercises(ex.items);
            if (!cancelled) setCatalog(ex.items);
          }
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
            setError(toUserMessage(err, "Не удалось загрузить прогресс"));
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
  const liftTrends = useMemo(() => buildLiftTrends(workouts, catalog, 6), [workouts, catalog]);
  const badges = useMemo(() => computeBadges(workouts), [workouts]);
  const calendarDays = useMemo(
    () => buildCalendarDays(workouts, year, monthIndex),
    [workouts, year, monthIndex],
  );
  const completedCount = workouts.filter((w) => w.status === "completed").length;
  const weekOverview = useMemo(() => buildWeeklyWorkoutOverview(workouts), [workouts]);

  async function askWeekAi() {
    if (weekAiBusy) return;
    if (!getStoredToken() || !isOnline()) {
      setWeekAiError("ИИ-разбор доступен онлайн после входа");
      return;
    }
    setWeekAiBusy(true);
    setWeekAiError(null);
    setWeekAiText(null);
    try {
      const res = await analyzeProgress(7);
      setWeekAiText(res.report);
    } catch (err) {
      setWeekAiError(toUserMessage(err, "ИИ-тренер временно недоступен"));
    } finally {
      setWeekAiBusy(false);
    }
  }

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
    <section className="mx-auto max-w-4xl">
      <Header title="Прогресс" subtitle="Тренировки, питание и календарь" />

      {loading ? <PageSkeleton cards={2} /> : null}
      {error ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}

      {!loading && completedCount === 0 ? (
        <div className="mb-3 rounded-2xl bg-tg-secondary p-4">
          <p className="text-sm font-semibold">Здесь появится ваш прогресс</p>
          <p className="mt-1 text-sm text-tg-hint">
            Закройте первую тренировку — откроются серия, графики и достижения.
          </p>
          <Link
            to="/"
            className="mt-3 block w-full rounded-xl bg-tg-button px-4 py-3 text-center text-sm font-semibold text-tg-button-text"
          >
            К сегодняшней тренировке
          </Link>
        </div>
      ) : (
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-tg-secondary p-4">
            <p className="text-xs text-tg-hint">Серия тренировок</p>
            <p className="mt-1 text-2xl font-semibold">{streak} дн.</p>
            <p className="mt-1 text-[11px] text-tg-hint">Подряд с завершёнными тренировками</p>
          </div>
          <div className="rounded-2xl bg-tg-secondary p-4">
            <p className="text-xs text-tg-hint">Завершено</p>
            <p className="mt-1 text-2xl font-semibold">{completedCount}</p>
            <p className="mt-1 text-[11px] text-tg-hint">Всего завершённых тренировок</p>
          </div>
        </div>
      )}

      {pending > 0 || source === "cache" ? (
        <p className="mb-3 text-xs text-tg-hint">
          {source === "cache" ? "Показаны сохранённые данные" : "Данные обновлены"}
          {pending > 0 ? ` · ждёт сети: ${pending}` : ""}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {completedCount > 0 ? <HabitsCheckin /> : null}
        <WeeklyOverview
          overview={weekOverview}
          onAskAi={() => void askWeekAi()}
          aiBusy={weekAiBusy}
        />
        {weekAiError ? (
          <p className="rounded-xl bg-tg-secondary px-3 py-2 text-xs text-amber-800">{weekAiError}</p>
        ) : null}
        {weekAiText ? (
          <div className="rounded-2xl bg-tg-secondary p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">ИИ · разбор недели</p>
              <button type="button" className="text-xs text-tg-hint" onClick={() => setWeekAiText(null)}>
                Скрыть
              </button>
            </div>
            <p className="whitespace-pre-wrap text-sm text-tg-hint">{weekAiText}</p>
            <Link to="/ai" className="mt-2 inline-block text-xs text-tg-link">
              Открыть чат с тренером →
            </Link>
          </div>
        ) : null}
        <StrengthTrends trends={liftTrends.slice(0, 1)} />

        <button
          type="button"
          onClick={() => setDetailsOpen((value) => !value)}
          aria-expanded={detailsOpen}
          className="w-full rounded-xl bg-tg-secondary px-4 py-3 text-sm font-medium text-tg-link"
        >
          {detailsOpen ? "Скрыть подробную аналитику" : "Календарь, достижения и подробные графики"}
        </button>

        {detailsOpen ? <>
        <BadgesPanel badges={badges} />
        {liftTrends.length > 1 ? <StrengthTrends trends={liftTrends} /> : null}
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
          onSelectDate={setSelectedDate}
        />
        </> : null}
      </div>
      {selectedDate ? <WorkoutDayDetails
        date={selectedDate}
        workouts={workouts.filter((workout) => workoutDateKey(workout) === selectedDate)}
        catalog={catalog}
        onClose={() => setSelectedDate(null)}
        onChanged={(changed, deletedId) => setWorkouts((current) => deletedId
          ? current.filter((item) => item.id !== deletedId)
          : current.map((item) => item.id === changed?.id ? changed : item))}
      /> : null}
    </section>
  );
}
