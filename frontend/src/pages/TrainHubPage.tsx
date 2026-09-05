/**
 * Training hub — programs + custom workout (bottom nav «Тренировки»).
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getStoredToken } from "@/api/client";
import { fetchExercises } from "@/api/exercises";
import { fetchPrograms, startProgramWorkout } from "@/api/programs";
import { fetchMyProfile, updateMyProfile } from "@/api/users";
import {
  fetchPlannedWorkoutPlan,
  fetchWorkoutHistory,
  fetchWorkoutSchedule,
  type WorkoutScheduleOverview,
} from "@/api/workouts";
import { Header } from "@/components/layout/Header";
import { PlannedWorkoutEditor } from "@/features/workout/components/PlannedWorkoutEditor";
import {
  cacheExercises,
  readCachedExercises,
  readCachedWorkouts,
  rememberWorkoutId,
  saveLocalSession,
} from "@/db/syncQueue";
import { trackEvent } from "@/lib/analytics";
import { findResumableSession, restoreSessionIntoStore } from "@/lib/sessionRestore";
import { useWorkoutStore } from "@/store/workoutStore";
import type { LocalSetDraft, Program, WorkoutPlan } from "@/types/workout";
import {
  buildExerciseHistory,
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
import { enumLabel, programDayLabel } from "@/utils/localization";
import { toUserMessage } from "@/utils/errors";
import { phaseFromPlan } from "@/utils/cycleTraining";
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
  const [recentTitles, setRecentTitles] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<WorkoutScheduleOverview | null>(null);
  const [preparedPlan, setPreparedPlan] = useState<WorkoutPlan | null>(null);

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
          const [programs, profile, history, scheduleOverview] = await Promise.all([
            fetchPrograms({ templatesOnly: true }),
            fetchMyProfile().catch(() => null),
            fetchWorkoutHistory().catch(() => []),
            fetchWorkoutSchedule().catch(() => null),
          ]);
          const g = (profile?.goals as Record<string, unknown>) || {};
          const activeId = String(g.active_program_id || "");
          const active =
            (activeId && programs.items.find((p) => p.id === activeId)) || null;
          if (!cancelled) {
            setGoals(g);
            setProgram(active);
            setSchedule(scheduleOverview);
            const titles = (history || [])
              .filter((w: { status?: string }) => w.status === "completed")
              .slice(0, 3)
              .map((w: { title?: string | null }) => w.title || "Тренировка");
            setRecentTitles(titles);
          }
        } else {
          const cached = await readCachedWorkouts();
          if (!cancelled) {
            setRecentTitles(
              cached
                .filter((w) => w.status === "completed")
                .slice(0, 3)
                .map((w) => w.title || "Тренировка"),
            );
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

      let historyMap = buildExerciseHistory(await readCachedWorkouts());
      if (isOnline() && getStoredToken()) {
        try {
          historyMap = buildExerciseHistory(await fetchWorkoutHistory());
        } catch {
          /* keep */
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
      <Header title="Тренировки" subtitle="Программы и свой день" />
      <div className="space-y-3">
        {error ? <div className="rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}
        {loading ? <p className="text-sm text-tg-hint">Загрузка…</p> : null}

        {canResume ? (
          <div className="rounded-2xl bg-tg-secondary p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-tg-hint">В работе</p>
            <p className="mt-1 text-base font-semibold">
              {activeWorkout?.title || "Активная тренировка"}
            </p>
            <button
              type="button"
              onClick={() => navigate(`/workouts/active/${resumeId}`)}
              className="mt-3 w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text"
            >
              Продолжить
            </button>
          </div>
        ) : program && todayProgramCompleted ? (
          <div className="rounded-2xl bg-tg-secondary p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-tg-hint">Моя программа</p>
            <p className="mt-1 text-base font-semibold">Тренировка выполнена</p>
            <p className="mt-1 text-xs text-tg-hint">
              {schedule?.current?.title || programDayLabel(program.name)} — результат сохранён.
            </p>
            <Link
              to="/progress"
              className="mt-3 block min-h-[44px] w-full rounded-xl bg-tg-button px-4 py-3 text-center text-sm font-semibold text-tg-button-text"
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
          </div>
        ) : program ? (
          <div className="rounded-2xl bg-tg-secondary p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-tg-hint">
              {canStartProgramNow ? "Моя программа" : "Следующая тренировка"}
            </p>
            <p className="mt-1 text-base font-semibold">{programDayLabel(program.name)}</p>
            <p className="mt-1 text-sm text-tg-hint">
              {dayTitle} · {phaseMetaFromName(effectiveWeekPhase).label}
              {levelLabel ? ` · ${levelLabel}` : ""}
            </p>
            {preparedPlan?.load_adjustment_label ? (
              <p className="mt-2 rounded-xl bg-tg-bg px-3 py-2 text-xs text-tg-hint">
                {preparedPlan.load_adjustment_label}. Базовая фаза программы не сдвигается.
              </p>
            ) : null}
            {canStartProgramNow ? (
              <button
                type="button"
                disabled={starting}
                onClick={() => void startToday()}
                className="mt-3 w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-60"
              >
                {starting ? "Стартуем…" : `Начать · ${dayTitle}`}
              </button>
            ) : (
              <p className="mt-3 rounded-xl bg-tg-bg px-3 py-2.5 text-center text-xs text-tg-hint">
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
          </div>
        ) : !loading ? (
          <div className="rounded-2xl bg-tg-secondary p-4">
            <p className="text-sm font-semibold">Нет активной программы</p>
            <p className="mt-1 text-xs text-tg-hint">
              Выберите сплит — здесь появится быстрый старт.
            </p>
            <Link
              to="/programs"
              className="mt-3 block w-full rounded-xl bg-tg-button px-4 py-3 text-center text-sm font-semibold text-tg-button-text"
            >
              Выбрать программу
            </Link>
          </div>
        ) : null}

        <Link to="/programs" className="block rounded-2xl bg-tg-secondary p-4 active:opacity-90">
          <p className="text-sm font-semibold">Программы</p>
          <p className="mt-1 text-xs text-tg-hint">
            Готовые сплиты под зал, дом и улицу. Фильтры по полу, уровню и ограничениям.
          </p>
        </Link>
        <Link to="/workouts" className="block rounded-2xl bg-tg-secondary p-4 active:opacity-90">
          <p className="text-sm font-semibold">Каталог · своя тренировка</p>
          <p className="mt-1 text-xs text-tg-hint">
            Соберите день из упражнений: поиск, мышцы, шаблон подходов.
          </p>
        </Link>

        {recentTitles.length ? (
          <div className="rounded-2xl bg-tg-secondary p-4">
            <p className="text-sm font-semibold">Недавние</p>
            <ul className="mt-2 space-y-1 text-xs text-tg-hint">
              {recentTitles.map((t, i) => (
                <li key={`${t}-${i}`}>· {t}</li>
              ))}
            </ul>
            <Link to="/progress" className="mt-2 inline-block text-xs text-tg-link">
              Вся история в прогрессе →
            </Link>
          </div>
        ) : null}

        <Link to="/" className="block rounded-2xl bg-tg-bg px-4 py-3 text-center text-sm text-tg-link">
          ← На главную · «Сегодня»
        </Link>
      </div>
    </section>
  );
}
