/**
 * Exercise hub — programs + custom workout (bottom nav «Упражнения»).
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { getStoredToken } from "@/api/client";
import { fetchExercises } from "@/api/exercises";
import { fetchMyPrograms, fetchPrograms, startProgramWorkout } from "@/api/programs";
import { fetchWorkoutHistory } from "@/api/workouts";
import { fetchMyProfile, updateMyProfile } from "@/api/users";
import {
  fetchPlannedWorkoutPlan,
  fetchWorkoutSchedule,
  fetchWorkoutScheduleSettings,
  saveWorkoutScheduleSettings,
  type WorkoutScheduleOverview,
  type WorkoutScheduleSettings,
} from "@/api/workouts";
import { Header } from "@/components/layout/Header";
import { AppCard } from "@/components/ui/AppCard";
import { StatusNotice } from "@/components/ui/StatusNotice";
import { PlannedWorkoutEditor } from "@/features/workout/components/PlannedWorkoutEditor";
import { PreWorkoutReadinessDialog } from "@/features/workout/components/PreWorkoutReadinessDialog";
import { WorkoutScheduleSettingsCard } from "@/features/workout/components/WorkoutScheduleSettingsCard";
import { ExerciseHubCards } from "@/features/workout/components/ExerciseHubCards";
import { ExerciseHubDiscovery } from "@/features/workout/components/ExerciseHubDiscovery";
import { usePreWorkoutReadiness } from "@/features/workout/hooks/usePreWorkoutReadiness";
import {
  cacheExercises,
  readCachedExercises,
  rememberWorkoutId,
  saveLocalSession,
} from "@/db/syncQueue";
import { loadExerciseHints } from "@/db/workoutLoadHints";
import { trackEvent } from "@/lib/analytics";
import { findResumableSession, restoreSessionIntoStore } from "@/lib/sessionRestore";
import { useWorkoutStore } from "@/store/workoutStore";
import { buttonClass } from "@/theme/visualStyles";
import type { Exercise, LocalSetDraft, Program, Workout, WorkoutPlan } from "@/types/workout";
import {
  draftsWithSuggestions,
  ensureProgramStartDate,
  localDateKey,
  type WeekPhase,
} from "@/utils/loadProgression";
import { isOnline } from "@/utils/network";
import {
  cursorGoalsPatch,
  listProgramDays,
  phaseMetaFromName,
  readProgramCursor,
} from "@/utils/programProgress";
import { programLocation } from "@/utils/programRecommend";
import { enumLabel, programDayLabel } from "@/utils/localization";
import { toUserMessage } from "@/utils/errors";
import { cycleTrainingEnabledForProfile, phaseFromPlan } from "@/utils/cycleTraining";
import {
  canStartProgramFromSchedule,
  plannedWorkoutOccurrence,
  startableWorkoutOccurrence,
} from "@/utils/workoutSchedule";

function draftsFromWorkout(workout: {
  plan?: WorkoutPlan | Record<string, unknown> | null;
  sets: {
    exercise_id: string;
    set_number: number;
    rest_time_sec: number | null;
    is_completed?: boolean;
  }[];
}): LocalSetDraft[] {
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

export function TrainHubPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const clientWorkoutId = useWorkoutStore((s) => s.clientWorkoutId);
  const setCatalog = useWorkoutStore((s) => s.setCatalog);
  const setActiveWorkout = useWorkoutStore((s) => s.setActiveWorkout);
  const setDrafts = useWorkoutStore((s) => s.setDrafts);
  const setIdMapping = useWorkoutStore((s) => s.setIdMapping);
  const setCurrentExerciseIndex = useWorkoutStore((s) => s.setCurrentExerciseIndex);

  const [program, setProgram] = useState<Program | null>(null);
  const [goals, setGoals] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<WorkoutScheduleOverview | null>(null);
  const [scheduleSettings, setScheduleSettings] = useState<WorkoutScheduleSettings | null>(null);
  const [preparedPlan, setPreparedPlan] = useState<WorkoutPlan | null>(null);
  const [hubCatalog, setHubCatalog] = useState<Exercise[]>([]);
  const [exerciseCount, setExerciseCount] = useState<number>();
  const [recentHistory, setRecentHistory] = useState<Workout[]>([]);
  const readiness = usePreWorkoutReadiness(cycleTrainingEnabledForProfile(goals));

  const resumeId = clientWorkoutId ?? activeWorkout?.id ?? null;
  const canResume = Boolean(
    resumeId &&
      activeWorkout &&
      activeWorkout.status !== "completed" &&
      activeWorkout.status !== "skipped",
  );

  const cursor = useMemo(
    () => (program ? readProgramCursor(goals, program) : null),
    [goals, program],
  );
  const dayIndex = cursor?.nextDayIndex ?? 1;
  const weekPhase: WeekPhase = cursor?.weekPhase ?? "medium";
  const startableOccurrence = startableWorkoutOccurrence(schedule);
  const plannedOccurrence = plannedWorkoutOccurrence(schedule);
  const canStartProgramNow = canStartProgramFromSchedule(schedule);
  const preparedDayIndex = plannedOccurrence?.day_index ?? dayIndex;
  const dayTitle =
    (program ? listProgramDays(program) : []).find((d) => d.dayIndex === preparedDayIndex)?.title ||
    `День ${preparedDayIndex}`;
  const levelLabel = (() => {
    const lvl = String(program?.level || program?.target_level || "");
    return lvl ? enumLabel(lvl) : "";
  })();
  const todayProgramCompleted = schedule?.current?.status === "completed";
  const preparedDate = plannedOccurrence?.target_date ?? localDateKey();
  const effectiveWeekPhase = phaseFromPlan(preparedPlan, weekPhase);
  const programPlace = program ? programLocation(program) || String(goals.location || "gym") : "gym";
  const heroPlace = programPlace === "home" || programPlace === "outdoor" ? programPlace : "gym";

  useEffect(() => {
    let cancelled = false;
    if (!program || !getStoredToken() || !isOnline()) {
      setPreparedPlan(null);
      return () => {
        cancelled = true;
      };
    }
    void fetchPlannedWorkoutPlan({
      programId: program.id,
      scheduledDate: preparedDate,
      dayIndex: preparedDayIndex,
      weekPhase,
    }).then((plan) => {
      if (!cancelled) setPreparedPlan(plan);
    }).catch(() => {
      if (!cancelled) setPreparedPlan(null);
    });
    return () => {
      cancelled = true;
    };
  }, [preparedDate, preparedDayIndex, program, weekPhase]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const cachedExercises = await readCachedExercises();
        if (!cancelled && cachedExercises.length) {
          setHubCatalog(cachedExercises);
          setExerciseCount(cachedExercises.length);
        }
        const store = useWorkoutStore.getState();
        if (
          !store.activeWorkout ||
          store.activeWorkout.status === "completed" ||
          store.activeWorkout.status === "skipped"
        ) {
          const session = await findResumableSession();
          if (session) await restoreSessionIntoStore(session);
        }

        if (getStoredToken() && isOnline()) {
          const [programs, myPrograms, profile, scheduleOverview, recurringSchedule, exercises, history] = await Promise.all([
            fetchPrograms({ templatesOnly: true }),
            fetchMyPrograms().catch(() => ({ items: [] })),
            fetchMyProfile().catch(() => null),
            fetchWorkoutSchedule().catch(() => null),
            fetchWorkoutScheduleSettings().catch(() => null),
            fetchExercises({ pageSize: 200 }).catch(() => null),
            fetchWorkoutHistory({ limit: 30 }).catch(() => []),
          ]);
          const g = (profile?.goals as Record<string, unknown>) || {};
          const anthropometry = (profile?.anthropometry as Record<string, unknown>) || {};
          const goalsWithSex = { ...g, sex: anthropometry.sex || g.sex || "" };
          const activeId = String(g.active_program_id || "");
          const active =
            (activeId && [...programs.items, ...myPrograms.items].find((p) => p.id === activeId)) || null;
          if (!cancelled) {
            setGoals(goalsWithSex);
            setProgram(active);
            setSchedule(scheduleOverview);
            setScheduleSettings(recurringSchedule);
            if (exercises) {
              setHubCatalog(exercises.items);
              setExerciseCount(exercises.total);
              void cacheExercises(exercises.items);
            }
            setRecentHistory(history);
          }
        }
      } catch (err) {
        if (!cancelled) setError(toUserMessage(err, "Не удалось загрузить тренировки"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (location.hash !== "#schedule" || !scheduleSettings) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById("schedule")?.focus({ preventScroll: true });
      document.getElementById("schedule")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.hash, scheduleSettings]);

  async function saveRecurringSchedule(input: { days: number[]; startTime: string }) {
    const saved = await saveWorkoutScheduleSettings(input);
    setScheduleSettings(saved);
    setSchedule(await fetchWorkoutSchedule().catch(() => schedule));
    trackEvent("schedule_saved", { days_count: saved.days.length, source: "train_hub" });
  }

  async function startToday() {
    if (!program || starting) return;
    if (todayProgramCompleted) {
      setError("Сегодняшняя тренировка программы уже выполнена.");
      return;
    }
    if (!canStartProgramNow) {
      setError("Следующая тренировка ещё не наступила. Пока можно подготовить замены.");
      return;
    }
    if (canResume && resumeId) {
      navigate(`/workouts/active/${resumeId}`);
      return;
    }
    const cycleReadiness = await readiness.requestReadiness();
    if (cycleReadiness === null) return;
    setStarting(true);
    setError(null);
    const startDayIndex = startableOccurrence?.day_index ?? dayIndex;
    try {
      if (isOnline() && getStoredToken()) {
        const ex = await fetchExercises({ pageSize: 200 });
        await cacheExercises(ex.items);
        setCatalog(ex.items);
      } else {
        const cached = await readCachedExercises();
        if (cached.length) setCatalog(cached);
      }

      const { start, goalsPatch: startPatch } = ensureProgramStartDate(goals, program.id);
      const cursorPatch = cursorGoalsPatch(
        program.id,
        {
          nextDayIndex: startDayIndex,
          weekPhase,
          phaseSource: cursor?.phaseSource ?? "auto",
          workoutsInPhase: cursor?.workoutsInPhase ?? 0,
          startedAt: start,
        },
        localDateKey(),
      );
      const goalsMerged = { ...goals, ...(startPatch || {}), ...cursorPatch };
      if (isOnline() && getStoredToken()) {
        try {
          const profile = await updateMyProfile({ goals: goalsMerged });
          setGoals((profile.goals as Record<string, unknown>) || goalsMerged);
        } catch {
          setGoals(goalsMerged);
        }
      } else {
        setGoals(goalsMerged);
      }

      const workout = await startProgramWorkout({
        programId: program.id,
        dayIndex: startDayIndex,
        scheduledDate:
          startableOccurrence?.target_date,
        weekPhase,
        cycleReadiness,
      });
      const clientId = crypto.randomUUID();
      const plan = (workout.plan || {}) as WorkoutPlan;
      const effectivePhase = phaseFromPlan(plan, weekPhase);
      const phaseMeta = phaseMetaFromName(effectivePhase);
      const planWithWarmup = {
        ...plan,
        warmup_pending: true,
        warmup_location: String(goals.location || "gym"),
      } as WorkoutPlan & { warmup_pending?: boolean; warmup_location?: string };
      const workoutWithPlan = { ...workout, plan: planWithWarmup };

      const historyMap = await loadExerciseHints(
        Array.isArray(plan.exercises) ? plan.exercises.map((item) => item.exercise_id) : [],
      );
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
        program_id: program.id,
        day_index: startDayIndex,
        source: "train_hub",
        week_phase: effectivePhase,
        load_adjusted: Boolean(plan.load_adjustment),
      });
      navigate(`/workouts/active/${clientId}`);
    } catch (err) {
      setError(toUserMessage(err, "Не удалось начать тренировку"));
    } finally {
      setStarting(false);
    }
  }

  return (
    <section>
      <Header title="Упражнения" subtitle="Программы тренировок и свой день" />
      <div className="space-y-3">
        {error ? <StatusNotice tone="danger">{error}</StatusNotice> : null}
        {loading ? <p className="text-sm text-tg-hint">Загрузка…</p> : null}

        {canResume ? (
          <AppCard tone="ember" className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-tg-hint">В работе</p>
            <p className="mt-1 text-base font-semibold">
              {activeWorkout?.title || "Активная тренировка"}
            </p>
            <button
              type="button"
              onClick={() => navigate(`/workouts/active/${resumeId}`)}
              className={`${buttonClass()} mt-3 w-full`}
            >
              Продолжить
            </button>
          </AppCard>
        ) : program && todayProgramCompleted ? (
          <AppCard tone="success" className={`train-program-hero train-program-hero-${heroPlace} p-4`}>
            <p className="text-xs font-medium uppercase tracking-wide text-tg-hint">Моя программа</p>
            <p className="mt-1 text-base font-semibold">Тренировка выполнена</p>
            <p className="mt-1 text-xs text-tg-hint">
              {schedule?.current?.title || programDayLabel(program.name)} — результат сохранён.
            </p>
            <Link
              to="/progress"
              className={`${buttonClass()} mt-3 w-full`}
            >
              Открыть прогресс
            </Link>
            {plannedOccurrence ? (
              <PlannedWorkoutEditor
                programId={program.id}
                scheduledDate={preparedDate}
                dayIndex={preparedDayIndex}
                weekPhase={weekPhase}
                disabled={!isOnline()}
              />
            ) : null}
          </AppCard>
        ) : program ? (
          <AppCard tone="ember" className={`train-program-hero train-program-hero-${heroPlace} p-4`}>
            <p className="text-xs font-medium uppercase tracking-wide text-tg-hint">
              {canStartProgramNow ? "Моя программа" : "Следующая тренировка"}
            </p>
            <p className="mt-1 text-base font-semibold">{programDayLabel(program.name)}</p>
            <p className="mt-1 text-sm text-tg-hint">
              {dayTitle} · {phaseMetaFromName(effectiveWeekPhase).label}
              {levelLabel ? ` · ${levelLabel}` : ""}
            </p>
            {preparedPlan?.load_adjustment_label ? (
              <p className="app-card-inset mt-2 px-3 py-2 text-xs text-tg-hint">
                {preparedPlan.load_adjustment_label}. Базовая фаза программы не сдвигается.
              </p>
            ) : null}
            {canStartProgramNow ? (
              <button
                type="button"
                disabled={starting}
                onClick={() => void startToday()}
                className={`${buttonClass()} mt-3 w-full`}
              >
                {starting ? "Стартуем…" : `Начать · ${dayTitle}`}
              </button>
            ) : (
              <p className="app-card-inset mt-3 px-3 py-2.5 text-center text-xs text-tg-hint">
                До дня тренировки доступны просмотр плана и подготовка замен.
              </p>
            )}
            <PlannedWorkoutEditor
              programId={program.id}
              scheduledDate={preparedDate}
              dayIndex={preparedDayIndex}
              weekPhase={weekPhase}
              disabled={starting || !isOnline()}
            />
            {!isOnline() ? (
              <p className="mt-1 text-center text-[11px] text-tg-hint">
                Подготовка замен доступна после подключения к интернету.
              </p>
            ) : null}
            <Link to="/" className="mt-2 block text-center text-xs text-tg-link">
              Выбрать день / неделю на главной
            </Link>
          </AppCard>
        ) : !loading ? (
          <AppCard tone="indigo" className="p-4">
            <p className="text-sm font-semibold">Нет активной программы</p>
            <p className="mt-1 text-xs text-tg-hint">
              Выберите сплит — здесь появится быстрый старт.
            </p>
            <Link
              to="/programs"
              className={`${buttonClass()} mt-3 w-full`}
            >
              Выбрать программу
            </Link>
          </AppCard>
        ) : null}

        {scheduleSettings ? (
          <WorkoutScheduleSettingsCard
            settings={scheduleSettings}
            disabled={!isOnline()}
            onSave={saveRecurringSchedule}
          />
        ) : null}

        <ExerciseHubCards exerciseCount={exerciseCount} />
        <Link to="/workouts?focus=search" aria-label="Найти упражнение" className="app-card app-card-indigo flex min-h-11 items-center gap-2 px-4 py-3 text-sm text-tg-hint">
          <span aria-hidden="true" className="text-lg text-tg-link">⌕</span>
          Найти подходящее упражнение
        </Link>
        <ExerciseHubDiscovery catalog={hubCatalog} history={recentHistory} />

        <Link to="/" className={`${buttonClass("secondary")} w-full`}>
          ← На главную · «Сегодня»
        </Link>
      </div>
      <PreWorkoutReadinessDialog
        open={readiness.open}
        onChoose={readiness.chooseReadiness}
        onClose={readiness.cancelReadiness}
      />
    </section>
  );
}
