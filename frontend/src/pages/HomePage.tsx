import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getStoredToken } from "@/api/client";
import { fetchExercises } from "@/api/exercises";
import { fetchPrograms, startProgramWorkout } from "@/api/programs";
import { fetchMyProfile, updateMyProfile } from "@/api/users";
import { fetchWorkoutHistory } from "@/api/workouts";
import { FeedbackModal } from "@/components/FeedbackModal";
import { Header } from "@/components/layout/Header";
import {
  cacheExercises,
  getPendingCount,
  readCachedWorkouts,
  rememberWorkoutId,
  saveLocalSession,
} from "@/db/syncQueue";
import { trackEvent } from "@/lib/analytics";
import { useUserStore } from "@/store/userStore";
import { useWorkoutStore } from "@/store/workoutStore";
import type { LocalSetDraft, Program, WorkoutPlan } from "@/types/workout";
import { isOnline } from "@/utils/network";
import {
  buildExerciseHistory,
  draftsWithSuggestions,
  ensureProgramStartDate,
  resolveWeekPhase,
} from "@/utils/loadProgression";
import { pickTodayDayIndex, recommendPrograms } from "@/utils/programRecommend";
import { computeStreak } from "@/utils/progress";

const ADMIN_USERNAMES = new Set(
  String(import.meta.env.VITE_ADMIN_TELEGRAM_USERNAMES || "Filatov_Slava")
    .split(",")
    .map((s) => s.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean),
);

function draftsFromWorkout(workout: {
  plan?: WorkoutPlan | Record<string, unknown> | null;
  sets: { exercise_id: string; set_number: number; rest_time_sec: number | null }[];
}): LocalSetDraft[] {
  const plan = (workout.plan || {}) as WorkoutPlan;
  if (Array.isArray(plan.exercises) && plan.exercises.length) {
    const drafts: LocalSetDraft[] = [];
    for (const item of [...plan.exercises].sort((a, b) => a.order - b.order)) {
      const sets = item.target_sets || 3;
      for (let n = 1; n <= sets; n += 1) {
        drafts.push({
          exerciseId: item.exercise_id,
          setNumber: n,
          reps: "",
          weight: "",
          isCompleted: false,
          restTimeSec: item.rest_sec ?? 60,
        });
      }
    }
    return drafts;
  }
  return workout.sets.map((s) => ({
    exerciseId: s.exercise_id,
    setNumber: s.set_number,
    reps: "",
    weight: "",
    isCompleted: false,
    restTimeSec: s.rest_time_sec ?? 60,
  }));
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
  const setCatalog = useWorkoutStore((s) => s.setCatalog);
  const setActiveWorkout = useWorkoutStore((s) => s.setActiveWorkout);
  const setDrafts = useWorkoutStore((s) => s.setDrafts);
  const setIdMapping = useWorkoutStore((s) => s.setIdMapping);
  const setCurrentExerciseIndex = useWorkoutStore((s) => s.setCurrentExerciseIndex);

  const [streak, setStreak] = useState(0);
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(isOnline());
  const [recommended, setRecommended] = useState<Program[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [profileGoals, setProfileGoals] = useState<Record<string, unknown>>({});

  const resumeId = clientWorkoutId ?? activeWorkout?.id ?? null;
  const canResume = Boolean(
    resumeId &&
      activeWorkout &&
      activeWorkout.status !== "completed" &&
      activeWorkout.status !== "skipped",
  );

  const todayProgram = recommended[0] ?? null;
  const todayDay = useMemo(
    () => (todayProgram ? pickTodayDayIndex(todayProgram) : 1),
    [todayProgram],
  );

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

  async function startToday() {
    if (!todayProgram || starting) {
      navigate("/programs");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      if (isOnline() && getStoredToken()) {
        const ex = await fetchExercises({ pageSize: 200 });
        await cacheExercises(ex.items);
        setCatalog(ex.items);
      }

      const { start, goalsPatch } = ensureProgramStartDate(profileGoals, todayProgram.id);
      if (goalsPatch && isOnline() && getStoredToken()) {
        try {
          const profile = await updateMyProfile({
            goals: { ...profileGoals, ...goalsPatch },
          });
          setProfileGoals((profile.goals as Record<string, unknown>) || { ...profileGoals, ...goalsPatch });
        } catch {
          setProfileGoals((g) => ({ ...g, ...goalsPatch }));
        }
      } else if (goalsPatch) {
        setProfileGoals((g) => ({ ...g, ...goalsPatch }));
      }

      const workout = await startProgramWorkout({
        programId: todayProgram.id,
        dayIndex: todayDay,
      });
      const clientId = crypto.randomUUID();
      const plan = (workout.plan || {}) as WorkoutPlan;
      const phaseMeta = resolveWeekPhase(start);
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
        workout,
        drafts,
        currentExerciseIndex: 0,
      });
      setIdMapping(clientId, workout.id);
      setActiveWorkout(workout);
      setDrafts(drafts);
      setCurrentExerciseIndex(0);
      trackEvent("program_started", {
        program_id: todayProgram.id,
        day_index: todayDay,
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

  return (
    <section>
      <Header title="Главная" subtitle="Сегодняшняя тренировка и прогресс" />
      <div className="space-y-3">
        {error ? <div className="rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}

        <div className="rounded-2xl bg-tg-secondary p-4">
          <p className="text-sm font-medium">Сегодня</p>
          {todayProgram ? (
            <>
              <p className="mt-1 text-base font-semibold">{todayProgram.name}</p>
              <p className="mt-1 text-sm text-tg-hint">
                День {todayDay}
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

        {canResume ? (
          <button
            type="button"
            onClick={() => navigate(`/workouts/active/${resumeId}`)}
            className="block w-full rounded-xl bg-tg-button px-4 py-3 text-center text-sm font-semibold text-tg-button-text"
          >
            Продолжить тренировку
          </button>
        ) : (
          <button
            type="button"
            disabled={starting}
            onClick={() => void startToday()}
            className="block w-full rounded-xl bg-tg-button px-4 py-3 text-center text-sm font-semibold text-tg-button-text disabled:opacity-60"
          >
            {starting
              ? "Стартуем…"
              : todayProgram
                ? `Начать: ${todayProgram.name}`
                : "Сегодняшняя тренировка"}
          </button>
        )}
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
