import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { analyzeProgress } from "@/api/ai";
import { getStoredToken } from "@/api/client";
import { fetchExercises } from "@/api/exercises";
import { fetchStrengthTrendSets, type StrengthTrendSets } from "@/api/strengthTrends";
import {
  fetchProgressDashboard,
  type ProgressDashboard,
  type ProgressDashboardPeriod,
} from "@/api/progressDashboard";
import { fetchDailyMetricsRange, type DailyMetric } from "@/api/dailyMetrics";
import { fetchNutritionRange } from "@/api/nutrition";
import { fetchMyProfile, updateMyProfile } from "@/api/users";
import {
  fetchPersonalRegularity,
  fetchWorkoutHistory,
  type PersonalRegularity,
} from "@/api/workouts";
import { PlanRegularityCard } from "@/components/PlanRegularityCard";
import { Header } from "@/components/layout/Header";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PlusAccessSummary } from "@/features/subscription/components/PlusAccessSummary";
import { hasPlus } from "@/features/subscription/subscriptionAccess";
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
import { BadgesPanel } from "@/features/progress/pages/BadgesPanel";
import { BodyMeasurementsSummary } from "@/features/progress/pages/BodyMeasurementsSummary";
import { StrengthTrendSetsCard } from "@/features/progress/pages/StrengthTrendSets";
import { WellnessSummary } from "@/features/progress/pages/WellnessSummary";
import { PersonalDashboardCard } from "@/features/progress/pages/PersonalDashboardCard";
import { TrainingLoadAnalytics } from "@/features/progress/pages/TrainingLoadAnalytics";
import { NutritionSummaryCard } from "@/features/progress/pages/NutritionSummaryCard";
import type { Exercise, Workout } from "@/types/workout";
import { computeBadges } from "@/utils/achievements";
import { isOnline } from "@/utils/network";
import {
  buildCalendarDays,
  buildNutritionBalance,
  computeDailyVolume,
  groupNutritionByWeek,
  localDateKey,
  summarizeNutritionPeriods,
  type NutritionBalanceSummary,
  workoutDateKey,
} from "@/utils/progress";
import { buildWeeklyWorkoutOverview } from "@/utils/weeklyOverview";
import { toUserMessage } from "@/utils/errors";
import { useUserStore } from "@/store/userStore";
import { trackEvent } from "@/lib/analytics";
import {
  analyticsDepth,
  dashboardGuidance,
  visibleDashboardSections,
  type DashboardSectionId,
} from "@/utils/personalDashboard";

type NutritionRangeMode = "day" | "week";

export function ProgressPage() {
  const currentUser = useUserStore((state) => state.user);
  const ownerUserId = currentUser?.id;
  const plusAccess = hasPlus(currentUser);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [regularity, setRegularity] = useState<PersonalRegularity | null>(null);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"network" | "cache">("network");
  const [nutritionMode, setNutritionMode] = useState<NutritionRangeMode>("day");
  const [nutrition, setNutrition] = useState<NutritionBalanceSummary | null>(null);
  const [nutritionError, setNutritionError] = useState<string | null>(null);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetric[]>([]);
  const [dailyMetricsError, setDailyMetricsError] = useState<string | null>(null);
  const [strengthTrendSets, setStrengthTrendSets] = useState<StrengthTrendSets | null>(null);
  const [strengthTrendsError, setStrengthTrendsError] = useState<string | null>(null);
  const [profileGoals, setProfileGoals] = useState<Record<string, unknown>>({});
  const [dashboard, setDashboard] = useState<ProgressDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [analyticsSaving, setAnalyticsSaving] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [weekAiBusy, setWeekAiBusy] = useState(false);
  const [weekAiText, setWeekAiText] = useState<string | null>(null);
  const [weekAiError, setWeekAiError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    if (!plusAccess) {
      setLoading(false);
      setWorkouts([]);
      setRegularity(null);
      setNutrition(null);
      setDailyMetrics([]);
      setStrengthTrendSets(null);
      setDashboard(null);
      setProfileGoals({});
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setNutritionError(null);
      setDailyMetricsError(null);
      setStrengthTrendsError(null);
      setDashboardError(null);
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
          const recentStart = new Date();
          recentStart.setDate(recentStart.getDate() - 83);
          const loadDay = new Date();
          const currentMonthEnd = new Date(loadDay.getFullYear(), loadDay.getMonth() + 1, 0);
          const [items, range, ex, metrics, planRegularity, trendSets, profile, dashboardSummary] = await Promise.all([
            fetchWorkoutHistory({
              dateFrom: localDateKey(recentStart),
              dateTo: localDateKey(currentMonthEnd),
              limit: 200,
            }),
            fetchNutritionRange({ days: 31 }).catch((err: unknown) => {
              if (!cancelled) {
                setNutritionError(
                  toUserMessage(err, "Не удалось загрузить питание"),
                );
              }
              return null;
            }),
            fetchExercises({ pageSize: 200 }).catch(() => null),
            fetchDailyMetricsRange({ days: 30 }).catch((err: unknown) => {
              if (!cancelled) {
                setDailyMetricsError(toUserMessage(err, "Не удалось загрузить показатели"));
              }
              return null;
            }),
            fetchPersonalRegularity().catch(() => null),
            fetchStrengthTrendSets().catch((err: unknown) => {
              if (!cancelled) {
                setStrengthTrendsError(toUserMessage(err, "Не удалось загрузить силовые тренды"));
              }
              return null;
            }),
            fetchMyProfile().catch(() => null),
            fetchProgressDashboard(28).catch((err: unknown) => {
              if (!cancelled) {
                setDashboardError(toUserMessage(err, "Не удалось загрузить сводку"));
              }
              return null;
            }),
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
            if (metrics) setDailyMetrics(metrics.days);
            setRegularity(planRegularity);
            setStrengthTrendSets(trendSets);
            if (profile) setProfileGoals(profile.goals);
            setDashboard(dashboardSummary);
          }
        } else if (cached.length) {
          if (!cancelled) {
            setWorkouts(cached);
            setSource("cache");
            setNutritionError("Питание доступно только онлайн");
            setStrengthTrendsError("Силовые тренды доступны только онлайн");
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
  }, [plusAccess]);

  useEffect(() => {
    if (plusAccess) trackEvent("plus_feature_opened", { feature: "progress_dashboard" });
  }, [plusAccess]);

  const series = useMemo(() => computeDailyVolume(workouts, 14), [workouts]);
  const badges = useMemo(
    () => computeBadges(workouts, ownerUserId, regularity, dashboard ? {
      completedWorkouts: dashboard.lifetime_completed_workouts,
      completedSets: dashboard.lifetime_completed_sets,
    } : null),
    [dashboard, ownerUserId, regularity, workouts],
  );
  const calendarDays = useMemo(
    () => buildCalendarDays(workouts, year, monthIndex),
    [workouts, year, monthIndex],
  );
  const completedCount = dashboard?.lifetime_completed_workouts
    ?? workouts.filter((w) => w.status === "completed").length;
  const weekOverview = useMemo(() => buildWeeklyWorkoutOverview(workouts), [workouts]);
  const level = String(profileGoals.level || "beginner");
  const goal = String(profileGoals.primary_goal || "maintain");
  const depth = analyticsDepth(level, profileGoals.advanced_analytics_enabled);
  const visibleSections = visibleDashboardSections(goal, depth);

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

  const guidance = useMemo(() => dashboardGuidance({
    goal,
    dashboard,
    regularity,
    nutritionDays: nutrition?.days.filter((day) => day.hasLogs).length ?? 0,
    wellnessDays: dailyMetrics.filter((day) =>
      day.steps != null || day.sleep_minutes != null || day.active_minutes != null,
    ).length,
  }), [dailyMetrics, dashboard, goal, nutrition, regularity]);

  async function setAdvancedAnalytics(expanded: boolean) {
    if (analyticsSaving || profileGoals.advanced_analytics_enabled === expanded) return;
    const previous = profileGoals.advanced_analytics_enabled;
    setAnalyticsSaving(true);
    setAnalyticsError(null);
    setProfileGoals((current) => ({ ...current, advanced_analytics_enabled: expanded }));
    try {
      const profile = await updateMyProfile({ goals: { advanced_analytics_enabled: expanded } });
      setProfileGoals(profile.goals);
      trackEvent("progress_analytics_depth_changed", { expanded, level });
    } catch (err) {
      setProfileGoals((current) => ({ ...current, advanced_analytics_enabled: previous }));
      setAnalyticsError(toUserMessage(err, "Не удалось сохранить режим аналитики"));
    } finally {
      setAnalyticsSaving(false);
    }
  }

  async function changeDashboardPeriod(period: ProgressDashboardPeriod) {
    if (dashboardLoading || dashboard?.period_days === period) return;
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      setDashboard(await fetchProgressDashboard(period));
    } catch (err) {
      setDashboardError(toUserMessage(err, "Не удалось загрузить выбранный период"));
    } finally {
      setDashboardLoading(false);
    }
  }

  function shiftMonth(delta: number) {
    const d = new Date(year, monthIndex + delta, 1);
    setYear(d.getFullYear());
    setMonthIndex(d.getMonth());
    if (getStoredToken() && isOnline()) {
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      void fetchWorkoutHistory({
        dateFrom: localDateKey(d),
        dateTo: localDateKey(end),
        limit: 200,
      }).then((items) => {
        setWorkouts((current) => {
          const merged = new Map(current.map((item) => [item.id, item]));
          items.forEach((item) => merged.set(item.id, item));
          return [...merged.values()];
        });
      }).catch(() => setError("Не удалось загрузить выбранный месяц"));
    }
  }

  function renderDashboardSection(section: DashboardSectionId) {
    if (section === "wellness") {
      return <WellnessSummary days={dailyMetrics} error={dailyMetricsError} />;
    }
    if (section === "measurements") return <BodyMeasurementsSummary />;
    if (section === "nutrition") {
      return <NutritionSummaryCard
        mode={nutritionMode}
        onModeChange={setNutritionMode}
        error={nutritionError}
        series={nutritionSeries}
        dailyTarget={nutrition?.dailyTarget ?? null}
        periods={nutritionPeriods}
      />;
    }
    if (section === "strength") {
      return <StrengthTrendSetsCard
        data={strengthTrendSets}
        error={strengthTrendsError}
        simple={depth === "basic"}
      />;
    }
    return <div className="contents">
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
    </div>;
  }

  if (!plusAccess) {
    return (
      <section className="mx-auto max-w-4xl">
        <Header title="Прогресс" subtitle="Тренировки, питание и календарь" />
        <PlusAccessSummary feature="progress_dashboard" />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl">
      <Header title="Прогресс" subtitle="Тренировки, питание и календарь" />

      {loading ? <PageSkeleton cards={2} /> : null}
      {error ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}

      {!loading ? <PersonalDashboardCard
        goal={goal}
        level={level}
        depth={depth}
        guidance={guidance}
        saving={analyticsSaving}
        error={analyticsError || (depth === "basic" ? dashboardError : null)}
        onExpandedChange={(expanded) => void setAdvancedAnalytics(expanded)}
      /> : null}

      {!loading ? (
        <div className="mb-3 grid grid-cols-2 gap-3">
          <PlanRegularityCard summary={regularity} valueSize="large" />
          <div className="rounded-2xl bg-tg-secondary p-4">
            <p className="text-xs text-tg-hint">Завершено</p>
            <p className="mt-1 text-2xl font-semibold">{completedCount}</p>
            <p className="mt-1 text-[11px] text-tg-hint">Всего завершённых тренировок</p>
          </div>
        </div>
      ) : null}

      {pending > 0 || source === "cache" ? (
        <p className="mb-3 text-xs text-tg-hint">
          {source === "cache" ? "Показаны сохранённые данные" : "Данные обновлены"}
          {pending > 0 ? ` · ждёт сети: ${pending}` : ""}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {visibleSections.map((section) => (
          <div key={section} className="contents">{renderDashboardSection(section)}</div>
        ))}

        {depth !== "basic" ? <TrainingLoadAnalytics
          data={dashboard}
          loading={dashboardLoading}
          error={dashboardError}
          advanced={depth === "advanced"}
          onPeriodChange={(period) => void changeDashboardPeriod(period)}
        /> : null}

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
