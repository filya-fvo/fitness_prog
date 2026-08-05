import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getStoredToken } from "@/api/client";
import { fetchExercises } from "@/api/exercises";
import { fetchPrograms, startProgramWorkout } from "@/api/programs";
import { fetchMyProfile, updateMyProfile } from "@/api/users";
import { fetchWorkoutHistory } from "@/api/workouts";
import { FeedbackModal } from "@/components/FeedbackModal";
import { HabitsCheckin } from "@/components/HabitsCheckin";
import { Header } from "@/components/layout/Header";
import {
  cacheExercises,
  getPendingCount,
  readCachedExercises,
  readCachedWorkouts,
  rememberWorkoutId,
  saveLocalSession,
} from "@/db/syncQueue";
import { findResumableSession, restoreSessionIntoStore } from "@/lib/sessionRestore";
import { trackEvent } from "@/lib/analytics";
import { hapticNotification } from "@/lib/telegram";
import { useUserStore } from "@/store/userStore";
import { useWorkoutStore } from "@/store/workoutStore";
import type { LocalSetDraft, Program, WorkoutPlan } from "@/types/workout";
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
  listProgramDays,
  phaseMetaFromName,
  readProgramCursor,
} from "@/utils/programProgress";
import { recommendPrograms } from "@/utils/programRecommend";
import { computeStreak, localDateKey as progressLocalDate, workoutDateKey } from "@/utils/progress";

function planHasReplacements(plan: WorkoutPlan | Record<string, unknown> | null | undefined): boolean {
  if (!plan || typeof plan !== "object") return false;
  const exercises = (plan as WorkoutPlan).exercises;
  if (!Array.isArray(exercises)) return false;
  return exercises.some(
    (e) => e.original_exercise_id && e.original_exercise_id !== e.exercise_id,
  );
}

const ADMIN_USERNAMES = new Set(
  String(import.meta.env.VITE_ADMIN_TELEGRAM_USERNAMES || "Filatov_Slava")
    .split(",")
    .map((s) => s.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean),
);

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
  const isAdmin = Boolean(
    user?.username &&
      ADMIN_USERNAMES.has(user.username.replace(/^@/, "").toLowerCase()),
  );
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
  const [pickDay, setPickDay] = useState(1);
  const [pickPhase, setPickPhase] = useState<WeekPhase>("medium");

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
            const [programs, profile] = await Promise.all([
              fetchPrograms({ templatesOnly: true }),
              fetchMyProfile().catch(() => null),
            ]);
            const goals = (profile?.goals as Record<string, unknown>) || {};
            if (!cancelled) setProfileGoals(goals);
            const activeId = String(goals.active_program_id || "");
            const active = activeId
              ? programs.items.find((p) => p.id === activeId) || null
              : null;
            const anthro = (profile?.anthropometry as Record<string, unknown>) || {};
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
        }
      } catch {
        // ignore dashboard soft failures
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

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
        await saveLocalSession({
          clientId: next.clientWorkoutId ?? next.activeWorkout.id,
          serverId: next.serverWorkoutId,
          workout: next.activeWorkout,
          drafts: next.drafts,
          currentExerciseIndex: next.currentExerciseIndex,
        });
      }
      setSessionHasReplacements(false);
      hapticNotification("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось восстановить");
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
      setError(err instanceof Error ? err.message : "Не удалось стартовать");
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
      <div className="space-y-3">
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

        <div className="rounded-2xl bg-tg-secondary p-4">
          <p className="text-sm font-medium">Сегодня</p>
          {todayProgram ? (
            <>
              <p className="mt-1 text-base font-semibold">{todayProgram.name}</p>
              <p className="mt-1 text-sm text-tg-hint">
                {todayDayTitle}
                {" · "}
                {phaseMetaFromName(todayPhase).label}
                {todayProgram.workout_type ? ` · ${todayProgram.workout_type}` : ""}
                {todayProgram.level || todayProgram.target_level
                  ? ` · ${todayProgram.level || todayProgram.target_level}`
                  : ""}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-tg-hint">
              Выберите готовую программу или соберите свою в каталоге.
              {!online ? " Сейчас оффлайн — сессия сохранится локально." : ""}
            </p>
          )}
          {canResume && activeWorkout?.title ? (
            <p className="mt-2 text-xs text-tg-hint">
              В работе: {activeWorkout.title}
              {hasReplacements ? " · есть замены упражнений" : ""}
            </p>
          ) : null}
          {hasReplacements ? (
            <button
              type="button"
              disabled={restoringDefaults}
              onClick={() => void handleRestoreDefaults()}
              className="mt-3 w-full rounded-xl bg-tg-bg px-3 py-2.5 text-xs font-medium text-tg-link disabled:opacity-60"
            >
              {restoringDefaults
                ? "Восстанавливаем…"
                : "Восстановить упражнения по умолчанию"}
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-tg-secondary p-4">
            <p className="text-xs text-tg-hint">Streak</p>
            <p className="mt-1 text-xl font-semibold">{streak} дн.</p>
          </div>
          <div className="rounded-2xl bg-tg-secondary p-4">
            <p className="text-xs text-tg-hint">Синхронизация</p>
            <p className="mt-1 text-xl font-semibold">{pending}</p>
            <p className="text-[10px] text-tg-hint">{online ? "онлайн" : "оффлайн"}</p>
          </div>
        </div>

        <HabitsCheckin />

        {canResume ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => navigate(`/workouts/active/${resumeId}`)}
              className="block w-full rounded-xl bg-tg-button px-4 py-3 text-center text-sm font-semibold text-tg-button-text"
            >
              Продолжить тренировку
            </button>
            <p className="text-center text-[11px] text-tg-hint">
              Чтобы выбрать другой день — сначала завершите текущую сессию.
            </p>
          </div>
        ) : todayProgram ? (
          <div className="flex overflow-hidden rounded-xl bg-tg-button">
            <button
              type="button"
              disabled={starting}
              onClick={() => void startToday()}
              className="min-w-0 flex-1 px-3 py-3 text-left text-sm font-semibold text-tg-button-text disabled:opacity-60"
            >
              {starting ? "Стартуем…" : `Начать: ${todayDayTitle}`}
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
        ) : (
          <button
            type="button"
            onClick={() => navigate("/programs")}
            className="block w-full rounded-xl bg-tg-button px-4 py-3 text-center text-sm font-semibold text-tg-button-text"
          >
            Выбрать программу
          </button>
        )}

        {pickerOpen && todayProgram ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
            <div className="w-full max-w-md rounded-2xl bg-tg-bg p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold">День и неделя</h3>
                <button type="button" className="text-sm text-tg-hint" onClick={() => setPickerOpen(false)}>
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
