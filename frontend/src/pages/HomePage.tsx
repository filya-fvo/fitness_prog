import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getStoredToken } from "@/api/client";
import { fetchExercises } from "@/api/exercises";
import { fetchDailyNutrition } from "@/api/nutrition";
import { fetchWaterLog } from "@/api/notifications";
import { fetchPrograms, startProgramWorkout } from "@/api/programs";
import { fetchMyProfile, updateMyProfile } from "@/api/users";
import { fetchWorkoutHistory } from "@/api/workouts";
import { FeedbackModal } from "@/components/FeedbackModal";
import { HabitsCheckin } from "@/components/HabitsCheckin";
import { Header } from "@/components/layout/Header";
import { ExerciseDetailModal } from "@/features/workout/components/ExerciseDetailModal";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import {
  cacheExercises,
  getPendingCount,
  readCachedExercises,
  readCachedWorkouts,
  rememberWorkoutId,
  saveLocalSession,
  syncWorkoutPlan,
} from "@/db/syncQueue";
import { findResumableSession, restoreSessionIntoStore } from "@/lib/sessionRestore";
import { trackEvent } from "@/lib/analytics";
import { hapticNotification } from "@/lib/telegram";
import { useUserStore } from "@/store/userStore";
import { useWorkoutStore } from "@/store/workoutStore";
import type { LocalSetDraft, Program, WorkoutPlan } from "@/types/workout";
import type { Exercise } from "@/types/workout";
import { isOnline } from "@/utils/network";
import {
  buildExerciseHistory,
  draftsWithSuggestions,
  ensureProgramStartDate,
  localDateKey,
  type WeekPhase,
} from "@/utils/loadProgression";
import {
  cursorGoalsPatch,
  listProgramDayExercises,
  listProgramDays,
  phaseMetaFromName,
  readProgramCursor,
} from "@/utils/programProgress";
import { toast } from "@/store/toastStore";
import { getHabitDay } from "@/utils/habits";
import { buildHomeTips } from "@/utils/homeTips";
import { recommendPrograms } from "@/utils/programRecommend";
import { computeStreak, localDateKey as progressLocalDate, workoutDateKey } from "@/utils/progress";
import { enumLabel } from "@/utils/localization";
import { compareProgramToProfile, programMismatchSummary } from "@/utils/programCompatibility";
import { isAdminUsername } from "@/utils/adminAccess";
import { toUserMessage } from "@/utils/errors";

function planHasReplacements(plan: WorkoutPlan | Record<string, unknown> | null | undefined): boolean {
  if (!plan || typeof plan !== "object") return false;
  const exercises = (plan as WorkoutPlan).exercises;
  if (!Array.isArray(exercises)) return false;
  return exercises.some(
    (e) => e.original_exercise_id && e.original_exercise_id !== e.exercise_id,
  );
}

function draftsFromWorkout(workout: {
  plan?: WorkoutPlan | Record<string, unknown> | null;
  sets: { exercise_id: string; set_number: number; rest_time_sec: number | null; is_completed?: boolean }[];
}): LocalSetDraft[] {
  // Prefer completed server sets; otherwise empty (caller uses draftsWithSuggestions for plan).
  const completed = (workout.sets || []).filter((s) => Boolean(s.is_completed));
  if (completed.length) {
    return completed.map((s) => ({
      exerciseId: s.exercise_id,
      setNumber: s.set_number,
      reps: "",
      weight: "",
      isCompleted: true,
      restTimeSec: s.rest_time_sec ?? 60,
    }));
  }
  return [];
}

export function HomePage() {
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  const isAdmin = isAdminUsername(user?.username);
  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const clientWorkoutId = useWorkoutStore((s) => s.clientWorkoutId);
  const catalog = useWorkoutStore((s) => s.catalog);
  const setCatalog = useWorkoutStore((s) => s.setCatalog);
  const setActiveWorkout = useWorkoutStore((s) => s.setActiveWorkout);
  const setDrafts = useWorkoutStore((s) => s.setDrafts);
  const setIdMapping = useWorkoutStore((s) => s.setIdMapping);
  const setCurrentExerciseIndex = useWorkoutStore((s) => s.setCurrentExerciseIndex);

  const [streak, setStreak] = useState(0);
  const [daysSinceLastWorkout, setDaysSinceLastWorkout] = useState<number | null>(null);
  const [reentryDismissed, setReentryDismissed] = useState(false);
  const reentryTrackedRef = useRef(false);
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(isOnline());
  const [recommended, setRecommended] = useState<Program[]>([]);
  const [starting, setStarting] = useState(false);
  const [restoringDefaults, setRestoringDefaults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [profileGoals, setProfileGoals] = useState<Record<string, unknown>>({});
  /** True when today's in-progress session has user exercise swaps. */
  const [sessionHasReplacements, setSessionHasReplacements] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerDialogRef = useModalAccessibility(pickerOpen, () => setPickerOpen(false));
  const [pickDay, setPickDay] = useState(1);
  const [pickPhase, setPickPhase] = useState<WeekPhase>("medium");
  const [completedCount, setCompletedCount] = useState(0);
  const [todayCalories, setTodayCalories] = useState<number | null>(null);
  const [calorieTarget, setCalorieTarget] = useState<number | null>(null);
  const [waterMl, setWaterMl] = useState(() => getHabitDay().waterMl);
  const [waterTargetMl, setWaterTargetMl] = useState<number | null>(null);
  const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);
  const [todayPlanOpen, setTodayPlanOpen] = useState(false);

  const resumeId = clientWorkoutId ?? activeWorkout?.id ?? null;
  const canResume = Boolean(
    resumeId &&
      activeWorkout &&
      activeWorkout.status !== "completed" &&
      activeWorkout.status !== "skipped",
  );

  const hasReplacements = useMemo(() => {
    if (activeWorkout && planHasReplacements(activeWorkout.plan)) return true;
    return sessionHasReplacements;
  }, [activeWorkout, sessionHasReplacements]);

  const todayProgram = recommended[0] ?? null;
  const programCursor = useMemo(
    () => (todayProgram ? readProgramCursor(profileGoals, todayProgram) : null),
    [profileGoals, todayProgram],
  );
  const todayDay = programCursor?.nextDayIndex ?? 1;
  const todayPhase: WeekPhase = programCursor?.weekPhase ?? "medium";
  const dayOptions = useMemo(
    () => (todayProgram ? listProgramDays(todayProgram) : []),
    [todayProgram],
  );
  const todayDayTitle =
    dayOptions.find((d) => d.dayIndex === todayDay)?.title || `День ${todayDay}`;
  const todayExercises = useMemo(
    () => (todayProgram ? listProgramDayExercises(todayProgram, todayDay) : []),
    [todayDay, todayProgram],
  );

  useEffect(() => {
    setTodayPlanOpen(false);
  }, [todayDay, todayProgram]);

  useEffect(() => {
    const onStatus = () => setOnline(isOnline());
    window.addEventListener("online", onStatus);
    window.addEventListener("offline", onStatus);
    return () => {
      window.removeEventListener("online", onStatus);
      window.removeEventListener("offline", onStatus);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const queue = await getPendingCount();
        let workouts = await readCachedWorkouts();
        const cachedExerciseCatalog = await readCachedExercises();
        if (cachedExerciseCatalog.length) setCatalog(cachedExerciseCatalog);

        // Detect exercise swaps on today's resumable session (store or Dexie).
        const storeState = useWorkoutStore.getState();
        let replacements = planHasReplacements(storeState.activeWorkout?.plan);
        if (
          !replacements ||
          !storeState.activeWorkout ||
          storeState.activeWorkout.status === "completed" ||
          storeState.activeWorkout.status === "skipped"
        ) {
          const session = await findResumableSession();
          if (session) {
            replacements = planHasReplacements(session.workout.plan);
            // Hydrate store so resume + restore work without re-opening workout.
            if (
              !storeState.activeWorkout ||
              storeState.activeWorkout.status === "completed" ||
              storeState.activeWorkout.status === "skipped"
            ) {
              await restoreSessionIntoStore(session);
            }
          }
        }
        if (!cancelled) setSessionHasReplacements(replacements);

        if (getStoredToken() && isOnline()) {
          try {
            workouts = await fetchWorkoutHistory();
          } catch {
            // keep cache
          }
          try {
            const [programs, profile, exerciseResponse] = await Promise.all([
              fetchPrograms({ templatesOnly: true }),
              fetchMyProfile().catch(() => null),
              fetchExercises({ pageSize: 200 }).catch(() => null),
            ]);
            if (exerciseResponse?.items.length) {
              setCatalog(exerciseResponse.items);
              await cacheExercises(exerciseResponse.items);
            }
            const goals = (profile?.goals as Record<string, unknown>) || {};
            const activeId = String(goals.active_program_id || "");
            const active = activeId
              ? programs.items.find((p) => p.id === activeId) || null
              : null;
            const anthro = (profile?.anthropometry as Record<string, unknown>) || {};
            const goalsWithSex = { ...goals, sex: anthro.sex || goals.sex || "" };
            if (!cancelled) setProfileGoals(goalsWithSex);
            const rec = recommendPrograms(
              programs.items,
              {
                primaryGoal: String(goals.primary_goal || ""),
                level: String(goals.level || ""),
                daysPerWeek: Number(goals.days_per_week) || undefined,
                equipment: Array.isArray(goals.equipment)
                  ? (goals.equipment as string[])
                  : [],
                sex: String(anthro.sex || goals.sex || ""),
                location: String(goals.location || ""),
                limitations: Array.isArray(goals.limitations)
                  ? (goals.limitations as string[])
                  : (goals.limitations as string | null) || null,
              },
              6,
            );
            // Active program from profile always first on Home
            const ordered = active
              ? [active, ...rec.filter((p) => p.id !== active.id)]
              : rec;
            if (!cancelled) setRecommended(ordered);
          } catch {
            // soft fail recommendations
          }
        }
        if (!cancelled) {
          setPending(queue);
          setStreak(computeStreak(workouts));
          const completed = workouts.filter((w) => w.status === "completed");
          setCompletedCount(completed.length);
          let latest: string | null = null;
          for (const w of completed) {
            const k = workoutDateKey(w);
            if (k && (!latest || k > latest)) latest = k;
          }
          if (latest) {
            const today = progressLocalDate(new Date());
            const t0 = new Date(today + "T12:00:00");
            const t1 = new Date(latest + "T12:00:00");
            const diff = Math.max(0, Math.round((t0.getTime() - t1.getTime()) / 86400000));
            setDaysSinceLastWorkout(diff);
          } else {
            setDaysSinceLastWorkout(null);
          }
          setWaterMl(getHabitDay().waterMl);
        }

        if (getStoredToken() && isOnline()) {
          try {
            const [daily, water] = await Promise.all([
              fetchDailyNutrition().catch(() => null),
              fetchWaterLog().catch(() => null),
            ]);
            if (!cancelled && daily) {
              setTodayCalories(Number(daily.totals?.calories) || 0);
              const t = daily.targets;
              if (t?.complete && t.calories_target != null) {
                setCalorieTarget(Number(t.calories_target));
              }
            }
            if (!cancelled && water) {
              if (water.daily_target_ml != null) setWaterTargetMl(water.daily_target_ml);
              if (typeof water.ml === "number") {
                setWaterMl(Math.max(getHabitDay().waterMl, water.ml));
              }
            }
          } catch {
            /* soft */
          }
        }
      } catch {
        // ignore dashboard soft failures
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [setCatalog]);

  const homeTips = useMemo(
    () =>
      buildHomeTips({
        daysSinceLastWorkout,
        completedWorkouts: completedCount,
        streak,
        hasProgram: Boolean(todayProgram),
        canResume,
        waterMl,
        waterTargetMl,
        todayCalories,
        calorieTarget,
      }),
    [
      calorieTarget,
      canResume,
      completedCount,
      daysSinceLastWorkout,
      streak,
      todayCalories,
      todayProgram,
      waterMl,
      waterTargetMl,
    ],
  );

  // Keep "has replacements" in sync when returning from active workout.
  useEffect(() => {
    setSessionHasReplacements(planHasReplacements(activeWorkout?.plan));
  }, [activeWorkout]);

  useEffect(() => {
    if (
      daysSinceLastWorkout != null &&
      daysSinceLastWorkout >= 7 &&
      !reentryDismissed &&
      !canResume &&
      !reentryTrackedRef.current
    ) {
      reentryTrackedRef.current = true;
      trackEvent("reentry_shown", { days: daysSinceLastWorkout });
    }
  }, [daysSinceLastWorkout, reentryDismissed, canResume]);

  const handleRestoreDefaults = useCallback(async () => {
    if (restoringDefaults) return;
    setRestoringDefaults(true);
    setError(null);
    try {
      let state = useWorkoutStore.getState();
      if (
        !state.activeWorkout ||
        state.activeWorkout.status === "completed" ||
        state.activeWorkout.status === "skipped"
      ) {
        const session = await findResumableSession();
        if (!session) {
          setError("Нет активной тренировки для восстановления.");
          return;
        }
        await restoreSessionIntoStore(session);
        state = useWorkoutStore.getState();
      }

      if (!state.catalog.length) {
        const cached = await readCachedExercises();
        if (cached.length) state.setCatalog(cached);
      }

      const ok = useWorkoutStore.getState().restoreDefaultExercises(
        useWorkoutStore.getState().catalog.length
          ? useWorkoutStore.getState().catalog
          : catalog,
      );
      if (!ok) {
        setError("Замен нет — уже упражнения по умолчанию.");
        setSessionHasReplacements(false);
        return;
      }

      const next = useWorkoutStore.getState();
      if (next.activeWorkout) {
        const clientWorkoutId = next.clientWorkoutId ?? next.activeWorkout.id;
        await saveLocalSession({
          clientId: clientWorkoutId,
          serverId: next.serverWorkoutId,
          workout: next.activeWorkout,
          drafts: next.drafts,
          currentExerciseIndex: next.currentExerciseIndex,
        });
        await syncWorkoutPlan({
          clientWorkoutId,
          plan: next.activeWorkout.plan as WorkoutPlan,
        });
      }
      setSessionHasReplacements(false);
      hapticNotification("success");
      toast("Упражнения по умолчанию восстановлены");
    } catch (err) {
      setError(toUserMessage(err, "Не удалось восстановить тренировку"));
    } finally {
      setRestoringDefaults(false);
    }
  }, [catalog, restoringDefaults]);

  async function startProgramDay(opts: {
    dayIndex: number;
    weekPhase: WeekPhase;
    phaseSource: "auto" | "manual";
  }) {
    if (!todayProgram || starting) {
      if (!todayProgram) navigate("/programs");
      return;
    }
    setStarting(true);
    setError(null);
    setPickerOpen(false);
    try {
      if (isOnline() && getStoredToken()) {
        const ex = await fetchExercises({ pageSize: 200 });
        await cacheExercises(ex.items);
        setCatalog(ex.items);
      }

      const { start, goalsPatch: startPatch } = ensureProgramStartDate(
        profileGoals,
        todayProgram.id,
      );
      const cursorPatch = cursorGoalsPatch(
        todayProgram.id,
        {
          nextDayIndex: opts.dayIndex,
          weekPhase: opts.weekPhase,
          phaseSource: opts.phaseSource,
          workoutsInPhase: programCursor?.workoutsInPhase ?? 0,
          startedAt: start,
        },
        localDateKey(),
      );
      const goalsMerged = { ...profileGoals, ...(startPatch || {}), ...cursorPatch };
      if (isOnline() && getStoredToken()) {
        try {
          const profile = await updateMyProfile({ goals: goalsMerged });
          setProfileGoals((profile.goals as Record<string, unknown>) || goalsMerged);
        } catch {
          setProfileGoals(goalsMerged);
        }
      } else {
        setProfileGoals(goalsMerged);
      }

      const workout = await startProgramWorkout({
        programId: todayProgram.id,
        dayIndex: opts.dayIndex,
        weekPhase: opts.weekPhase,
      });
      const clientId = crypto.randomUUID();
      const plan = (workout.plan || {}) as WorkoutPlan;
      const phaseMeta = phaseMetaFromName(opts.weekPhase);
      const planWithWarmup = {
        ...plan,
        week_phase: opts.weekPhase,
        week_label: phaseMeta.label,
        week_rir: phaseMeta.rir,
        week_in_cycle: phaseMeta.weekInCycle,
        warmup_pending: true,
        warmup_location: String(profileGoals.location || "gym"),
      } as WorkoutPlan & { warmup_pending?: boolean; warmup_location?: string };
      const workoutWithPlan = { ...workout, plan: planWithWarmup };

      let historyMap = buildExerciseHistory(await readCachedWorkouts());
      if (isOnline() && getStoredToken()) {
        try {
          historyMap = buildExerciseHistory(await fetchWorkoutHistory());
        } catch {
          // keep cache
        }
      }
      const drafts =
        Array.isArray(plan.exercises) && plan.exercises.length
          ? draftsWithSuggestions({
              exercises: plan.exercises,
              history: historyMap,
              phase: phaseMeta,
            })
          : draftsFromWorkout(workout);
      await rememberWorkoutId(clientId, workout.id);
      await saveLocalSession({
        clientId,
        serverId: workout.id,
        workout: workoutWithPlan,
        drafts,
        currentExerciseIndex: 0,
      });
      setIdMapping(clientId, workout.id);
      setActiveWorkout(workoutWithPlan);
      setDrafts(drafts);
      setCurrentExerciseIndex(0);
      trackEvent("program_started", {
        program_id: todayProgram.id,
        day_index: opts.dayIndex,
        source: "home",
        exercises: drafts.length,
        week_phase: phaseMeta.phase,
      });
      navigate(`/workouts/active/${clientId}`);
    } catch (err) {
      setError(toUserMessage(err, "Не удалось начать тренировку"));
      navigate("/programs");
    } finally {
      setStarting(false);
    }
  }

  async function startToday() {
    await startProgramDay({
      dayIndex: todayDay,
      weekPhase: todayPhase,
      phaseSource: programCursor?.phaseSource ?? "auto",
    });
  }

  return (
    <section>
      <Header title="Главная" subtitle="Сегодняшняя тренировка и прогресс" />
      <div className="grid gap-3 md:grid-cols-2">
        {error ? <div className="rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}

        {daysSinceLastWorkout != null && daysSinceLastWorkout >= 7 && !reentryDismissed && !canResume ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">С возвращением</p>
                <p className="mt-1 text-xs text-tg-hint">
                  Пауза {daysSinceLastWorkout} дн. Начните с лёгкой недели и комфортного веса —
                  лучше короткий вход, чем срыв.
                </p>
              </div>
              <button
                type="button"
                className="text-xs text-tg-hint"
                onClick={() => setReentryDismissed(true)}
              >
                ✕
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {todayProgram ? (
                <button
                  type="button"
                  disabled={starting}
                  onClick={() =>
                    void startProgramDay({
                      dayIndex: todayDay,
                      weekPhase: "light",
                      phaseSource: "manual",
                    })
                  }
                  className="rounded-xl bg-tg-button px-3 py-2 text-xs font-semibold text-tg-button-text disabled:opacity-60"
                >
                  {starting ? "…" : "Мягкий старт (лёгкая)"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate("/programs")}
                  className="rounded-xl bg-tg-button px-3 py-2 text-xs font-semibold text-tg-button-text"
                >
                  Выбрать программу
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate("/train")}
                className="rounded-xl bg-tg-secondary px-3 py-2 text-xs"
              >
                Каталог / короткая
              </button>
            </div>
          </div>
        ) : null}

        {/* Primary hero CTA first — review P0 */}
        {canResume ? (
          <div className="space-y-2 rounded-2xl bg-tg-secondary p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-tg-hint">Сейчас</p>
            <p className="text-base font-semibold">
              {activeWorkout?.title || "Тренировка в процессе"}
            </p>
            {hasReplacements ? (
              <p className="text-xs text-tg-hint">Есть замены упражнений</p>
            ) : null}
            <button
              type="button"
              onClick={() => navigate(`/workouts/active/${resumeId}`)}
              className="block w-full rounded-xl bg-tg-button px-4 py-3.5 text-center text-sm font-semibold text-tg-button-text"
            >
              Продолжить тренировку
            </button>
            {hasReplacements ? (
              <button
                type="button"
                disabled={restoringDefaults}
                onClick={() => void handleRestoreDefaults()}
                className="w-full rounded-xl bg-tg-bg px-3 py-2.5 text-xs font-medium text-tg-link disabled:opacity-60"
              >
                {restoringDefaults
                  ? "Восстанавливаем…"
                  : "Восстановить упражнения по умолчанию"}
              </button>
            ) : null}
            <p className="text-center text-[11px] text-tg-hint">
              Чтобы выбрать другой день — сначала завершите текущую сессию.
            </p>
          </div>
        ) : todayProgram ? (
          <div className="space-y-2 rounded-2xl bg-tg-secondary p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-tg-hint">Сегодня</p>
            <p className="text-base font-semibold">{todayProgram.name}</p>
            <p className="text-sm text-tg-hint">
              {todayDayTitle}
              {" · "}
              {phaseMetaFromName(todayPhase).label}
              {todayProgram.workout_type ? ` · ${enumLabel(todayProgram.workout_type)}` : ""}
              {(() => {
                const lvl = String(todayProgram.level || todayProgram.target_level || "");
                return lvl ? ` · ${enumLabel(lvl)}` : "";
              })()}
            </p>
            {todayExercises.length ? (
              <div className="rounded-xl bg-tg-bg/70 p-3">
                <button
                  type="button"
                  aria-expanded={todayPlanOpen}
                  className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left"
                  onClick={() => setTodayPlanOpen((open) => !open)}
                >
                  <span className="text-xs font-semibold">План на сегодня</span>
                  <span className="shrink-0 text-[11px] text-tg-link">
                    {todayExercises.length} упр. · {todayPlanOpen ? "Свернуть ↑" : "Развернуть ↓"}
                  </span>
                </button>
                {todayPlanOpen ? (
                  <ol className="mt-2 space-y-1.5 border-t border-tg-hint/15 pt-3">
                    {todayExercises.map((exercise, index) => (
                      <li key={exercise.key} className="flex items-start gap-2 text-xs">
                        <span className="w-4 shrink-0 text-right text-tg-hint">{index + 1}.</span>
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left text-tg-link"
                          onClick={() => {
                            const found = catalog.find(
                              (item) =>
                                item.id === exercise.exerciseId ||
                                item.name_ru.trim().toLowerCase() === exercise.name.trim().toLowerCase(),
                            );
                            if (found) setDetailExercise(found);
                            else setError("Описание этого упражнения пока не найдено в каталоге.");
                          }}
                        >
                          {exercise.name}
                          <span className="ml-1 text-[10px] text-tg-hint">Открыть</span>
                        </button>
                        {exercise.sets || exercise.reps ? (
                          <span className="shrink-0 text-tg-hint">
                            {exercise.sets ?? "—"} × {phaseMetaFromName(todayPhase).defaultReps}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>
            ) : null}
            {(() => {
              const mismatches = compareProgramToProfile(todayProgram, {
                primaryGoal: String(profileGoals.primary_goal || ""),
                level: String(profileGoals.level || ""),
                daysPerWeek: Number(profileGoals.days_per_week) || undefined,
                equipment: Array.isArray(profileGoals.equipment) ? profileGoals.equipment as string[] : [],
                sex: String(profileGoals.sex || ""),
                location: String(profileGoals.location || ""),
                limitations: profileGoals.limitations as string[] | string | null,
              });
              return mismatches.length ? (
                <div className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800">
                  <p>Отличается от анкеты: {programMismatchSummary(mismatches)}</p>
                  <Link to="/programs" className="mt-1 inline-flex min-h-[44px] items-center font-medium text-tg-link">
                    Подобрать подходящую
                  </Link>
                </div>
              ) : null;
            })()}
            <div className="flex overflow-hidden rounded-xl bg-tg-button">
              <button
                type="button"
                disabled={starting}
                onClick={() => void startToday()}
                className="min-w-0 flex-1 px-3 py-3.5 text-left text-sm font-semibold text-tg-button-text disabled:opacity-60"
              >
                {starting ? "Стартуем…" : `Начать · ${todayDayTitle}`}
                <span className="mt-0.5 block text-[10px] font-normal opacity-80">
                  {phaseMetaFromName(todayPhase).label} неделя
                </span>
              </button>
              <button
                type="button"
                disabled={starting}
                aria-label="Выбрать день и неделю программы"
                onClick={() => {
                  setPickDay(todayDay);
                  setPickPhase(todayPhase);
                  setPickerOpen(true);
                }}
                className="shrink-0 border-l border-black/10 px-4 py-3 text-lg font-semibold text-tg-button-text disabled:opacity-60"
              >
                ▾
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 rounded-2xl bg-tg-secondary p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-tg-hint">С чего начать</p>
            <p className="text-base font-semibold">Выберите программу на 10 минут</p>
            <p className="text-sm text-tg-hint">
              Готовый план тренировочных дней для зала или дома — либо соберите день из каталога.
              {!online ? " Сейчас нет сети — сессия сохранится на устройстве." : ""}
            </p>
            <button
              type="button"
              onClick={() => navigate("/programs")}
              className="block w-full rounded-xl bg-tg-button px-4 py-3.5 text-center text-sm font-semibold text-tg-button-text"
            >
              Выбрать программу
            </button>
            <button
              type="button"
              onClick={() => navigate("/workouts")}
              className="block w-full rounded-xl bg-tg-bg px-4 py-2.5 text-center text-sm font-medium"
            >
              Своя тренировка из каталога
            </button>
          </div>
        )}

        <div className="rounded-2xl bg-tg-secondary p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs text-tg-hint">Серия</p>
              <p className="mt-1 text-xl font-semibold">{streak} дн.</p>
            </div>
            {!online ? (
              <p className="text-right text-[11px] text-amber-600">
                Нет сети
                {pending > 0 ? ` · сохраним ${pending} при сети` : " · изменения на устройстве"}
              </p>
            ) : pending > 0 ? (
              <p className="text-right text-[11px] text-tg-hint">
                Ждёт сети: {pending}
              </p>
            ) : (
              <p className="text-right text-[11px] text-tg-hint">Сохранено</p>
            )}
          </div>
        </div>

        {homeTips.length ? (
          <div className="space-y-2">
            {homeTips.map((tip) => (
              <div key={tip.id} className="rounded-2xl bg-tg-secondary px-4 py-3">
                <p className="text-sm">{tip.text}</p>
                {tip.ctaLabel && tip.ctaTo ? (
                  <Link to={tip.ctaTo} className="mt-2 inline-block text-xs font-medium text-tg-link">
                    {tip.ctaLabel} →
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <HabitsCheckin />

        {detailExercise ? (
          <ExerciseDetailModal
            exercise={detailExercise}
            onClose={() => setDetailExercise(null)}
          />
        ) : null}

        {completedCount > 0 || canResume || todayProgram ? (
          <div className="rounded-2xl border border-tg-button/20 bg-tg-secondary px-4 py-3">
            <p className="text-sm font-semibold">Спросить тренера</p>
            <p className="mt-0.5 text-xs text-tg-hint">
              Замена, разбор недели или питание после тренировки
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Link
                to="/ai?q=Замени%20упражнение%20при%20дискомфорте"
                className="rounded-full bg-tg-bg px-2.5 py-1 text-[11px] text-tg-link"
              >
                Замена
              </Link>
              <Link
                to="/ai?q=Проанализируй%20мой%20прогресс%20за%20месяц"
                className="rounded-full bg-tg-bg px-2.5 py-1 text-[11px] text-tg-link"
              >
                Разбор недели
              </Link>
              <Link
                to="/ai?q=Что%20есть%20после%20тренировки"
                className="rounded-full bg-tg-bg px-2.5 py-1 text-[11px] text-tg-link"
              >
                После тренировки
              </Link>
              <Link to="/ai" className="rounded-full bg-tg-bg px-2.5 py-1 text-[11px]">
                Открыть чат
              </Link>
            </div>
          </div>
        ) : null}

        {pickerOpen && todayProgram ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
            <div
              ref={pickerDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="program-day-picker-title"
              tabIndex={-1}
              className="w-full max-w-md rounded-2xl bg-tg-bg p-4 shadow-xl"
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 id="program-day-picker-title" className="text-base font-semibold">День и неделя</h3>
                <button type="button" aria-label="Закрыть" className="text-sm text-tg-hint" onClick={() => setPickerOpen(false)}>
                  ✕
                </button>
              </div>
              <p className="mb-2 text-xs text-tg-hint">{todayProgram.name}</p>
              <p className="mb-1 text-xs font-medium text-tg-hint">День программы</p>
              <div className="mb-3 max-h-40 space-y-1 overflow-y-auto">
                {dayOptions.map((d) => (
                  <button
                    key={d.dayIndex}
                    type="button"
                    onClick={() => setPickDay(d.dayIndex)}
                    className={[
                      "w-full rounded-xl px-3 py-2 text-left text-sm",
                      pickDay === d.dayIndex ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary",
                    ].join(" ")}
                  >
                    {d.dayIndex}. {d.title}
                    {d.dayIndex === todayDay ? " · сегодня" : ""}
                  </button>
                ))}
              </div>
              <p className="mb-1 text-xs font-medium text-tg-hint">Неделя нагрузки</p>
              <div className="mb-4 grid grid-cols-3 gap-2">
                {(
                  [
                    ["light", "Лёгкая"],
                    ["medium", "Средняя"],
                    ["heavy", "Тяжёлая"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPickPhase(key)}
                    className={[
                      "rounded-xl px-2 py-2 text-xs font-medium",
                      pickPhase === key ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary text-tg-hint",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mb-3 text-[11px] text-tg-hint">
                После полного круга сплита: лёгкая → средняя → тяжёлая → …
              </p>
              <button
                type="button"
                disabled={starting}
                onClick={() =>
                  void startProgramDay({
                    dayIndex: pickDay,
                    weekPhase: pickPhase,
                    phaseSource: "manual",
                  })
                }
                className="w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-60"
              >
                {starting ? "Стартуем…" : "Начать выбранное"}
              </button>
            </div>
          </div>
        ) : null}
        <Link
          to="/programs"
          className="block w-full rounded-xl bg-tg-secondary px-4 py-3 text-center text-sm font-medium"
        >
          Все программы
        </Link>
        <Link
          to="/workouts"
          className="block w-full rounded-xl bg-tg-secondary px-4 py-3 text-center text-sm font-medium"
        >
          Своя тренировка из каталога
        </Link>
        <Link
          to="/progress"
          className="block w-full rounded-xl bg-tg-secondary px-4 py-3 text-center text-sm font-medium"
        >
          Открыть прогресс
        </Link>
        <Link
          to="/profile"
          className="block w-full rounded-xl bg-tg-secondary px-4 py-3 text-center text-sm font-medium"
        >
          Профиль: замеры и калории
        </Link>
        <button
          type="button"
          onClick={() => setFeedbackOpen(true)}
          className="block w-full rounded-xl bg-tg-secondary px-4 py-3 text-center text-sm font-medium"
        >
          Обратная связь
        </button>
        {isAdmin ? (
          <Link to="/admin" className="block text-center text-xs text-tg-link">
            Админка exercises/programs
          </Link>
        ) : null}
      </div>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </section>
  );
}
