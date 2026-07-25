import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { addWorkoutSet, completeWorkout, fetchWorkoutHistory } from "@/api/workouts";
import { Header } from "@/components/layout/Header";
import { NumberStepper } from "@/components/NumberStepper";
import {
  deleteLocalSession,
  enqueueSync,
  flushSyncQueue,
  readCachedWorkouts,
  resolveServerWorkoutId,
  saveLocalSession,
} from "@/db/syncQueue";
import { ExerciseMediaPlayer } from "@/features/workout/components/ExerciseMediaPlayer";
import { RestTimer } from "@/features/workout/components/RestTimer";
import { useMainButton } from "@/features/workout/hooks/useMainButton";
import { trackEvent } from "@/lib/analytics";
import { findResumableSession, restoreSessionIntoStore } from "@/lib/sessionRestore";
import { hapticImpact, hapticNotification } from "@/lib/telegram";
import { uniqueExerciseIds, useWorkoutStore } from "@/store/workoutStore";
import type { Exercise, Workout, WorkoutPlan, WorkoutSet } from "@/types/workout";
import { formatElapsed } from "@/utils/format";
import {
  buildExerciseHistory,
  resolveWeekPhase,
  suggestLoad,
  type WeekPhaseMeta,
} from "@/utils/loadProgression";
import { isOnline } from "@/utils/network";

function asPlan(raw: Workout["plan"]): WorkoutPlan {
  if (!raw || typeof raw !== "object") return { exercises: [] };
  const plan = raw as WorkoutPlan;
  return {
    title: plan.title ?? null,
    workout_type: plan.workout_type ?? null,
    day_index: plan.day_index ?? null,
    week_phase: plan.week_phase ?? null,
    week_in_cycle: plan.week_in_cycle ?? null,
    week_label: plan.week_label ?? null,
    week_rir: plan.week_rir ?? null,
    exercises: Array.isArray(plan.exercises) ? plan.exercises : [],
  };
}

export function ActiveWorkout() {
  const { workoutId } = useParams<{ workoutId: string }>();
  const navigate = useNavigate();

  const catalog = useWorkoutStore((s) => s.catalog);
  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const clientWorkoutId = useWorkoutStore((s) => s.clientWorkoutId);
  const drafts = useWorkoutStore((s) => s.drafts);
  const currentExerciseIndex = useWorkoutStore((s) => s.currentExerciseIndex);
  const updateDraft = useWorkoutStore((s) => s.updateDraft);
  const addDraftSet = useWorkoutStore((s) => s.addDraftSet);
  const removeDraftSet = useWorkoutStore((s) => s.removeDraftSet);
  const startRest = useWorkoutStore((s) => s.startRest);
  const adjustRest = useWorkoutStore((s) => s.adjustRest);
  const tickRest = useWorkoutStore((s) => s.tickRest);
  const stopRest = useWorkoutStore((s) => s.stopRest);
  const setExerciseRest = useWorkoutStore((s) => s.setExerciseRest);
  const isResting = useWorkoutStore((s) => s.isResting);
  const restSecondsLeft = useWorkoutStore((s) => s.restSecondsLeft);
  const setActiveWorkout = useWorkoutStore((s) => s.setActiveWorkout);
  const setDrafts = useWorkoutStore((s) => s.setDrafts);
  const nextExercise = useWorkoutStore((s) => s.nextExercise);
  const prevExercise = useWorkoutStore((s) => s.prevExercise);
  const setCurrentExerciseIndex = useWorkoutStore((s) => s.setCurrentExerciseIndex);
  const resetSession = useWorkoutStore((s) => s.resetSession);

  const [booting, setBooting] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [rpe, setRpe] = useState(7);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [offlineNote, setOfflineNote] = useState<string | null>(null);
  const [suggestNote, setSuggestNote] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [elapsedFinalSec, setElapsedFinalSec] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const state = useWorkoutStore.getState();
      const routeId = workoutId;
      if (!routeId) {
        navigate("/workouts", { replace: true });
        return;
      }
      const matches =
        state.clientWorkoutId === routeId ||
        state.serverWorkoutId === routeId ||
        state.activeWorkout?.id === routeId;
      if (state.activeWorkout && matches) {
        if (!cancelled) setBooting(false);
        return;
      }
      const session = await findResumableSession();
      if (
        session &&
        (session.clientId === routeId || session.serverId === routeId || session.workout.id === routeId)
      ) {
        await restoreSessionIntoStore(session);
        if (!cancelled) setBooting(false);
        return;
      }
      if (!cancelled) {
        setBooting(false);
        navigate("/workouts", { replace: true });
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [navigate, workoutId]);

  useEffect(() => {
    if (!isResting) return;
    const timer = window.setInterval(() => {
      const before = useWorkoutStore.getState().restSecondsLeft;
      tickRest();
      if (before <= 1) {
        hapticImpact("medium");
        hapticNotification("success");
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isResting, tickRest]);

  // Workout elapsed clock — ticks while session is active
  useEffect(() => {
    if (booting || summary || !activeWorkout || activeWorkout.status === "completed") return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeWorkout, booting, summary]);

  // Ensure started_at exists so the clock has an anchor
  useEffect(() => {
    if (!activeWorkout || activeWorkout.started_at) return;
    if (activeWorkout.status === "completed") return;
    const patched: Workout = {
      ...activeWorkout,
      started_at: new Date().toISOString(),
    };
    setActiveWorkout(patched);
    void saveLocalSession({
      clientId: useWorkoutStore.getState().clientWorkoutId ?? workoutId ?? patched.id,
      serverId: useWorkoutStore.getState().serverWorkoutId,
      workout: patched,
      drafts: useWorkoutStore.getState().drafts,
      currentExerciseIndex: useWorkoutStore.getState().currentExerciseIndex,
    });
  }, [activeWorkout, setActiveWorkout, workoutId]);

  const stableClientId = clientWorkoutId ?? workoutId ?? activeWorkout?.id ?? "";
  const exerciseMap = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);
  const plan = useMemo(() => asPlan(activeWorkout?.plan), [activeWorkout?.plan]);
  const exerciseIds = useMemo(() => {
    if (plan.exercises.length) {
      return [...plan.exercises]
        .sort((a, b) => a.order - b.order)
        .map((item) => item.exercise_id);
    }
    return uniqueExerciseIds(drafts);
  }, [drafts, plan.exercises]);

  const weekPhase: WeekPhaseMeta = useMemo(() => {
    const map = {
      light: resolveWeekPhase("2026-01-01", new Date(2026, 0, 1)),
      medium: resolveWeekPhase("2026-01-01", new Date(2026, 0, 8)),
      heavy: resolveWeekPhase("2026-01-01", new Date(2026, 0, 15)),
    } as const;
    if (plan.week_phase === "light" || plan.week_phase === "medium" || plan.week_phase === "heavy") {
      const p = map[plan.week_phase];
      const weekInCycle = ([1, 2, 3].includes(Number(plan.week_in_cycle))
        ? Number(plan.week_in_cycle)
        : p.weekInCycle) as 1 | 2 | 3;
      return {
        ...p,
        weekInCycle,
        label: plan.week_label || p.label,
        rir: plan.week_rir || p.rir,
      };
    }
    return resolveWeekPhase(null);
  }, [plan.week_in_cycle, plan.week_label, plan.week_phase, plan.week_rir]);

  const isLastExercise =
    exerciseIds.length > 0 && currentExerciseIndex >= exerciseIds.length - 1;

  const workoutStartedAtMs = useMemo(() => {
    const raw = activeWorkout?.started_at;
    if (!raw) return null;
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : null;
  }, [activeWorkout?.started_at]);

  const elapsedSec = useMemo(() => {
    if (elapsedFinalSec != null) return elapsedFinalSec;
    if (workoutStartedAtMs == null) return 0;
    return Math.max(0, Math.floor((nowMs - workoutStartedAtMs) / 1000));
  }, [elapsedFinalSec, nowMs, workoutStartedAtMs]);

  const currentExerciseId = exerciseIds[currentExerciseIndex] ?? exerciseIds[0] ?? null;
  const currentExercise: Exercise | null = currentExerciseId
    ? exerciseMap.get(currentExerciseId) ??
      ({
        id: currentExerciseId,
        name_ru:
          plan.exercises.find((e) => e.exercise_id === currentExerciseId)?.name_ru ?? "Упражнение",
        muscle_group: "",
        equipment: null,
        description: null,
        technique: null,
        common_mistakes: null,
        difficulty: 1,
        video_url: null,
        animation_url: null,
        thumbnail_url: null,
        media_duration_sec: null,
        media_source: "none",
        tags: [],
      } satisfies Exercise)
    : null;

  const currentSets = useMemo(
    () =>
      drafts
        .filter((d) => d.exerciseId === currentExerciseId)
        .sort((a, b) => a.setNumber - b.setNumber),
    [currentExerciseId, drafts],
  );

  const currentRestSec = useMemo(() => {
    const open = currentSets.find((d) => !d.isCompleted);
    const any = open ?? currentSets[currentSets.length - 1];
    return any?.restTimeSec && any.restTimeSec > 0 ? any.restTimeSec : 60;
  }, [currentSets]);

  const REST_PRESETS = [45, 60, 75, 90, 120, 150, 180] as const;

  const completedCount = drafts.filter((d) => d.isCompleted).length;
  const targetReps =
    plan.exercises.find((e) => e.exercise_id === currentExerciseId)?.target_reps ??
    weekPhase.defaultReps;

  // Fill empty drafts from history once per exercise when session is live
  useEffect(() => {
    let cancelled = false;
    async function suggest() {
      if (!currentExerciseId || booting) return;
      const empty = drafts.filter(
        (d) => d.exerciseId === currentExerciseId && !d.isCompleted && (!d.weight || !d.reps),
      );
      if (!empty.length) {
        setSuggestNote(null);
        return;
      }
      try {
        let workouts = await readCachedWorkouts();
        if (isOnline()) {
          try {
            workouts = await fetchWorkoutHistory();
          } catch {
            // keep cache
          }
        }
        if (cancelled) return;
        const histMap = buildExerciseHistory(workouts);
        const sug = suggestLoad({
          history: histMap.get(currentExerciseId),
          phase: weekPhase,
        });
        if (!sug.weight && !sug.reps) return;
        const next = drafts.map((d) => {
          if (d.exerciseId !== currentExerciseId || d.isCompleted) return d;
          return {
            ...d,
            weight: d.weight || sug.weight,
            reps: d.reps || sug.reps,
          };
        });
        const changed = next.some((d, i) => d.weight !== drafts[i]?.weight || d.reps !== drafts[i]?.reps);
        if (changed) {
          setDrafts(next);
          setSuggestNote(sug.note);
          if (activeWorkout) {
            void saveLocalSession({
              clientId: useWorkoutStore.getState().clientWorkoutId ?? stableClientId,
              serverId: useWorkoutStore.getState().serverWorkoutId,
              workout: activeWorkout,
              drafts: next,
              currentExerciseIndex,
            });
          }
        } else {
          setSuggestNote(sug.note);
        }
      } catch {
        // soft fail
      }
    }
    void suggest();
    return () => {
      cancelled = true;
    };
    // only re-run when exercise changes / boot done
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, currentExerciseId, weekPhase.phase]);

  const persistSession = useCallback(
    async (workout: Workout, nextDrafts = drafts, exerciseIndex = currentExerciseIndex) => {
      const clientId = useWorkoutStore.getState().clientWorkoutId ?? stableClientId;
      const serverId = useWorkoutStore.getState().serverWorkoutId;
      await saveLocalSession({
        clientId,
        serverId,
        workout,
        drafts: nextDrafts,
        currentExerciseIndex: exerciseIndex,
      });
    },
    [currentExerciseIndex, drafts, stableClientId],
  );

  const applyRestForCurrentExercise = useCallback(
    (sec: number) => {
      if (!currentExerciseId) return;
      const clamped = Math.max(15, Math.min(600, Math.round(sec)));
      setExerciseRest(currentExerciseId, clamped);
      const next = useWorkoutStore.getState();
      if (next.activeWorkout) {
        void persistSession(next.activeWorkout, next.drafts);
      }
    },
    [currentExerciseId, persistSession, setExerciseRest],
  );

  const apiWorkoutId = useCallback(async () => {
    const state = useWorkoutStore.getState();
    const clientId = state.clientWorkoutId ?? stableClientId;
    if (state.serverWorkoutId) return state.serverWorkoutId;
    return resolveServerWorkoutId(clientId);
  }, [stableClientId]);

  const finishWorkout = useCallback(async () => {
    if (!activeWorkout || completing) return;
    // Only allow finish on the last exercise (or single-exercise session)
    const ids = exerciseIds.length
      ? exerciseIds
      : uniqueExerciseIds(useWorkoutStore.getState().drafts);
    const lastIdx = Math.max(0, ids.length - 1);
    if (ids.length > 0 && currentExerciseIndex < lastIdx) {
      setError("Завершить тренировку можно на последнем упражнении.");
      return;
    }
    setCompleting(true);
    setError(null);
    setOfflineNote(null);
    const finalElapsed = (() => {
      const started = activeWorkout.started_at ? Date.parse(activeWorkout.started_at) : NaN;
      if (!Number.isFinite(started)) return elapsedSec;
      return Math.max(0, Math.floor((Date.now() - started) / 1000));
    })();
    setElapsedFinalSec(finalElapsed);
    try {
      const tonnage = drafts.reduce((acc, draft) => {
        const reps = Number(draft.reps) || 0;
        const weight = Number(draft.weight) || 0;
        return acc + reps * weight;
      }, 0);
      const aiNotes =
        notes || "Отличная работа! Завтра день отдыха, рекомендую лёгкую мобильность.";
      const clientId = useWorkoutStore.getState().clientWorkoutId ?? stableClientId;

      let result: Workout;
      if (isOnline()) {
        try {
          await flushSyncQueue();
          const wid = await apiWorkoutId();
          result = await completeWorkout({ workoutId: wid, rpe, aiNotes });
        } catch {
          await enqueueSync({
            type: "complete_workout",
            clientWorkoutId: clientId,
            payload: { rpe, aiNotes },
          });
          result = {
            ...activeWorkout,
            status: "completed",
            rpe,
            ai_notes: aiNotes,
            completed_at: new Date().toISOString(),
            duration_sec: finalElapsed,
          };
          setOfflineNote("Завершение в очереди синхронизации.");
        }
      } else {
        await enqueueSync({
          type: "complete_workout",
          clientWorkoutId: clientId,
          payload: { rpe, aiNotes },
        });
        result = {
          ...activeWorkout,
          status: "completed",
          rpe,
          ai_notes: aiNotes,
          completed_at: new Date().toISOString(),
          duration_sec: finalElapsed,
        };
        setOfflineNote("Оффлайн: завершение сохранено локально.");
      }

      if (result.duration_sec == null) {
        result = { ...result, duration_sec: finalElapsed };
      }

      setActiveWorkout(result);
      await persistSession(result, drafts);
      await deleteLocalSession(clientId);
      resetSession();
      hapticNotification("success");
      trackEvent("workout_completed", {
        client_id: clientId,
        tonnage,
        rpe,
        week_phase: weekPhase.phase,
        duration_sec: finalElapsed,
      });
      setSummary(
        `Готово. Время: ${formatElapsed(finalElapsed)}. Упражнений: ${exerciseIds.length}. Подходов: ${completedCount}/${drafts.length}. Тоннаж: ${tonnage.toFixed(1)} кг. Сложность (1–10): ${rpe}. Неделя: ${weekPhase.label}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось завершить");
      setElapsedFinalSec(null);
    } finally {
      setCompleting(false);
    }
  }, [
    activeWorkout,
    apiWorkoutId,
    completedCount,
    completing,
    currentExerciseIndex,
    drafts,
    elapsedSec,
    exerciseIds,
    notes,
    persistSession,
    resetSession,
    rpe,
    setActiveWorkout,
    stableClientId,
    weekPhase.label,
    weekPhase.phase,
  ]);

  const scrollToFinish = useCallback(() => {
    if (!isLastExercise) {
      setCurrentExerciseIndex(Math.max(0, exerciseIds.length - 1));
      setError("Перейдите к последнему упражнению, чтобы завершить тренировку.");
      return;
    }
    const el = document.getElementById("workout-finish-panel");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [exerciseIds.length, isLastExercise, setCurrentExerciseIndex]);

  useMainButton({
    text: completing ? "Сохраняем…" : "Завершить тренировку",
    visible: Boolean(
      activeWorkout &&
        activeWorkout.status !== "completed" &&
        !booting &&
        !summary &&
        isLastExercise,
    ),
    enabled: !completing && isLastExercise,
    onClick: () => {
      void finishWorkout();
    },
  });

  async function completeSet(exerciseId: string, setNumber: number) {
    if (!activeWorkout) return;
    const draft = drafts.find((d) => d.exerciseId === exerciseId && d.setNumber === setNumber);
    if (!draft) return;
    const key = `${exerciseId}:${setNumber}`;
    setSavingKey(key);
    setError(null);
    setOfflineNote(null);

    const reps = draft.reps ? Number(draft.reps) : null;
    const weight = draft.weight ? Number(draft.weight) : null;
    const restTimeSec = draft.restTimeSec || 60;
    const clientId = useWorkoutStore.getState().clientWorkoutId ?? stableClientId;

    try {
      let serverSet: WorkoutSet | null = null;
      if (isOnline()) {
        try {
          await flushSyncQueue();
          const wid = await apiWorkoutId();
          serverSet = await addWorkoutSet({
            workoutId: wid,
            exerciseId,
            setNumber,
            reps,
            weight,
            restTimeSec,
            isCompleted: true,
          });
        } catch {
          serverSet = null;
        }
      }

      if (!serverSet) {
        await enqueueSync({
          type: "add_set",
          clientWorkoutId: clientId,
          payload: { exerciseId, setNumber, reps, weight, restTimeSec, isCompleted: true },
        });
        setOfflineNote("Подход сохранён локально (очередь синхронизации).");
      }

      const nextDrafts = drafts.map((d) =>
        d.exerciseId === exerciseId && d.setNumber === setNumber ? { ...d, isCompleted: true } : d,
      );
      updateDraft(exerciseId, setNumber, { isCompleted: true });
      setDrafts(nextDrafts);

      const localSet: WorkoutSet = serverSet ?? {
        id: crypto.randomUUID(),
        workout_id: activeWorkout.id,
        exercise_id: exerciseId,
        set_number: setNumber,
        reps,
        weight,
        is_completed: true,
        rest_time_sec: restTimeSec,
      };
      const nextWorkout: Workout = {
        ...activeWorkout,
        sets: [
          ...activeWorkout.sets.filter(
            (s) => !(s.exercise_id === exerciseId && s.set_number === setNumber),
          ),
          localSet,
        ],
      };
      setActiveWorkout(nextWorkout);
      await persistSession(nextWorkout, nextDrafts);
      hapticImpact("light");
      startRest(restTimeSec);

      const allCurrentDone = nextDrafts
        .filter((d) => d.exerciseId === exerciseId)
        .every((d) => d.isCompleted);
      if (allCurrentDone && currentExerciseIndex < exerciseIds.length - 1) {
        nextExercise();
        await persistSession(nextWorkout, nextDrafts, currentExerciseIndex + 1);
        trackEvent("workout_exercise_completed", {
          exercise_id: exerciseId,
          index: currentExerciseIndex + 1,
          total: exerciseIds.length,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить подход");
    } finally {
      setSavingKey(null);
    }
  }

  if (booting) {
    return (
      <section>
        <Header title="Тренировка" subtitle="Восстановление сессии…" />
        <p className="text-sm text-tg-hint">Загрузка…</p>
      </section>
    );
  }

  if (summary) {
    return (
      <section>
        <Header title="Тренировка завершена" subtitle={weekPhase.label} />
        <div className="mb-3 rounded-2xl bg-tg-secondary p-4 text-center">
          <p className="text-xs text-tg-hint">Время тренировки</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {formatElapsed(elapsedFinalSec ?? elapsedSec)}
          </p>
        </div>
        <div className="rounded-2xl bg-tg-secondary p-4 text-sm">{summary}</div>
        <button
          type="button"
          className="mt-4 w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text"
          onClick={() => navigate("/progress")}
        >
          К прогрессу
        </button>
      </section>
    );
  }

  if (!activeWorkout) {
    return (
      <section>
        <Header title="Тренировка" />
        <p className="text-sm text-tg-hint">Сессия не найдена.</p>
      </section>
    );
  }

  return (
    <section className="pb-24">
      <Header
        title={activeWorkout.title || "Активная тренировка"}
        subtitle={`Упр. ${Math.min(currentExerciseIndex + 1, exerciseIds.length)}/${exerciseIds.length || 1} · ${weekPhase.label} (RIR ${weekPhase.rir})`}
      />

      <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-tg-secondary px-4 py-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-tg-hint">Таймер тренировки</p>
          <p className="text-2xl font-semibold tabular-nums leading-none">{formatElapsed(elapsedSec)}</p>
        </div>
        <button
          type="button"
          onClick={scrollToFinish}
          disabled={completing}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-500/90 text-white shadow-md disabled:opacity-50"
          aria-label="Завершить тренировку"
          title="Завершить"
        >
          {/* stop: square in circle */}
          <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/90">
            <span className="block h-3.5 w-3.5 rounded-[2px] bg-white" />
          </span>
        </button>
      </div>

      {error ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}
      {offlineNote ? (
        <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-xs text-tg-hint">{offlineNote}</div>
      ) : null}
      {suggestNote ? (
        <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-xs text-tg-hint">{suggestNote}</div>
      ) : null}

      <div className="mb-3 rounded-xl bg-tg-secondary px-3 py-2 text-xs text-tg-hint">
        Неделя {weekPhase.weekInCycle}/3 · {weekPhase.label}: цель {weekPhase.defaultReps} повт.,{" "}
        {weekPhase.rir}. Вес: −/+ 1 кг, тонко −/+ 100 г.
      </div>

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {exerciseIds.map((id, idx) => {
          const name =
            exerciseMap.get(id)?.name_ru ||
            plan.exercises.find((e) => e.exercise_id === id)?.name_ru ||
            `№${idx + 1}`;
          const done = drafts.filter((d) => d.exerciseId === id).every((d) => d.isCompleted);
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setCurrentExerciseIndex(idx);
                if (activeWorkout) void persistSession(activeWorkout, drafts, idx);
              }}
              className={[
                "shrink-0 rounded-full px-3 py-1 text-xs",
                idx === currentExerciseIndex
                  ? "bg-tg-button text-tg-button-text"
                  : done
                    ? "bg-tg-secondary text-tg-hint"
                    : "bg-tg-secondary",
              ].join(" ")}
            >
              {idx + 1}. {name}
            </button>
          );
        })}
      </div>

      {currentExercise ? (
        <article className="space-y-3 rounded-2xl bg-tg-secondary p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-medium">{currentExercise.name_ru}</h2>
              <p className="mt-1 text-xs text-tg-hint">Цель: {targetReps} повт.</p>
            </div>
            <button
              type="button"
              className="shrink-0 text-xs text-tg-link"
              onClick={() => {
                addDraftSet(currentExercise.id);
                const next = useWorkoutStore.getState();
                if (next.activeWorkout) {
                  void persistSession(next.activeWorkout, next.drafts);
                }
              }}
            >
              + подход
            </button>
          </div>

          <ExerciseMediaPlayer exercise={currentExercise} compact />

          <div className="rounded-xl bg-tg-bg p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-tg-hint">Отдых между подходами</p>
              <p className="text-sm font-semibold tabular-nums">
                {Math.floor(currentRestSec / 60)}:{String(currentRestSec % 60).padStart(2, "0")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="h-9 w-12 rounded-lg bg-tg-secondary text-sm font-semibold"
                onClick={() => applyRestForCurrentExercise(currentRestSec - 15)}
                aria-label="Уменьшить отдых на 15 секунд"
              >
                −15
              </button>
              <button
                type="button"
                className="h-9 w-12 rounded-lg bg-tg-secondary text-sm font-semibold"
                onClick={() => applyRestForCurrentExercise(currentRestSec - 30)}
                aria-label="Уменьшить отдых на 30 секунд"
              >
                −30
              </button>
              <input
                type="number"
                min={15}
                max={600}
                step={15}
                value={currentRestSec}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) applyRestForCurrentExercise(n);
                }}
                className="h-9 min-w-0 flex-1 rounded-lg border border-black/10 bg-tg-secondary px-2 text-center text-sm"
                aria-label="Отдых в секундах"
              />
              <button
                type="button"
                className="h-9 w-12 rounded-lg bg-tg-secondary text-sm font-semibold"
                onClick={() => applyRestForCurrentExercise(currentRestSec + 30)}
                aria-label="Увеличить отдых на 30 секунд"
              >
                +30
              </button>
              <button
                type="button"
                className="h-9 w-12 rounded-lg bg-tg-secondary text-sm font-semibold"
                onClick={() => applyRestForCurrentExercise(currentRestSec + 15)}
                aria-label="Увеличить отдых на 15 секунд"
              >
                +15
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {REST_PRESETS.map((sec) => {
                const label =
                  sec < 60
                    ? `${sec}с`
                    : sec % 60 === 0
                      ? `${sec / 60}м`
                      : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
                return (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => applyRestForCurrentExercise(sec)}
                    className={[
                      "rounded-full px-2.5 py-1 text-[11px]",
                      currentRestSec === sec
                        ? "bg-tg-button text-tg-button-text"
                        : "bg-tg-secondary text-tg-hint",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[10px] text-tg-hint">
              Применяется к незавершённым подходам этого упражнения.
            </p>
          </div>

          {currentExercise.common_mistakes ? (
            <p className="text-xs text-tg-hint">Частые ошибки: {currentExercise.common_mistakes}</p>
          ) : null}

          <div className="space-y-3">
            {currentSets.map((draft) => {
              const key = `${draft.exerciseId}:${draft.setNumber}`;
              return (
                <div key={key} className="rounded-xl bg-tg-bg p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium text-tg-hint">Подход {draft.setNumber}</p>
                    {!draft.isCompleted && currentSets.length > 1 ? (
                      <button
                        type="button"
                        className="text-[10px] text-tg-hint"
                        onClick={() => {
                          removeDraftSet(draft.exerciseId, draft.setNumber);
                          const next = useWorkoutStore.getState();
                          if (next.activeWorkout) {
                            void persistSession(next.activeWorkout, next.drafts);
                          }
                        }}
                      >
                        удалить
                      </button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <NumberStepper
                      label="Вес"
                      unit="кг"
                      value={draft.weight}
                      disabled={draft.isCompleted}
                      step={1}
                      fineStep={0.1}
                      fineLabel="0.1"
                      onChange={(next) =>
                        updateDraft(draft.exerciseId, draft.setNumber, { weight: next })
                      }
                    />
                    <NumberStepper
                      label="Повторения"
                      value={draft.reps}
                      disabled={draft.isCompleted}
                      step={1}
                      onChange={(next) =>
                        updateDraft(draft.exerciseId, draft.setNumber, { reps: next })
                      }
                      format={(n) => (n <= 0 ? "" : String(Math.round(n)))}
                      parse={(raw) => {
                        const n = Number(raw);
                        return Number.isFinite(n) ? Math.round(n) : 0;
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={draft.isCompleted || savingKey === key}
                    onClick={() => void completeSet(draft.exerciseId, draft.setNumber)}
                    className="mt-2 w-full rounded-xl bg-tg-button px-3 py-2 text-sm font-semibold text-tg-button-text disabled:opacity-50"
                  >
                    {draft.isCompleted
                      ? "Выполнено"
                      : savingKey === key
                        ? "Сохраняем…"
                        : "Отметить выполненным"}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={currentExerciseIndex <= 0}
              onClick={() => {
                prevExercise();
                if (activeWorkout) {
                  void persistSession(activeWorkout, drafts, Math.max(0, currentExerciseIndex - 1));
                }
              }}
              className="rounded-xl bg-tg-bg px-3 py-2 text-sm disabled:opacity-40"
            >
              ← Назад
            </button>
            <button
              type="button"
              disabled={currentExerciseIndex >= exerciseIds.length - 1}
              onClick={() => {
                nextExercise();
                if (activeWorkout) {
                  void persistSession(
                    activeWorkout,
                    drafts,
                    Math.min(exerciseIds.length - 1, currentExerciseIndex + 1),
                  );
                }
              }}
              className="rounded-xl bg-tg-bg px-3 py-2 text-sm disabled:opacity-40"
            >
              Далее →
            </button>
          </div>
        </article>
      ) : null}

      {isResting ? (
        <RestTimer
          isResting={isResting}
          secondsLeft={restSecondsLeft}
          onSkip={stopRest}
          onAdjust={(delta) => adjustRest(delta)}
        />
      ) : null}

      {isLastExercise ? (
        <div id="workout-finish-panel" className="mt-4 space-y-2">
          <div className="rounded-xl bg-tg-secondary p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Завершение тренировки</p>
              <p className="text-sm font-semibold tabular-nums text-tg-hint">
                {formatElapsed(elapsedSec)}
              </p>
            </div>
            <label className="block text-sm font-medium text-tg-text">
              Насколько тяжело было? (оценка 1–10)
            </label>
            <p className="mt-1 text-xs text-tg-hint">
              Это субъективная оценка усилия всей тренировки. Нужна, чтобы видеть,
              как вы переносите нагрузку, и не перетренироваться. 1 — очень легко,
              10 — максимум, почти не смогли закончить.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(
                [
                  [1, "Очень легко"],
                  [3, "Легко"],
                  [5, "Средне"],
                  [7, "Тяжело"],
                  [9, "Очень тяжело"],
                  [10, "На пределе"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRpe(value)}
                  className={[
                    "rounded-full px-2.5 py-1 text-[11px]",
                    rpe === value
                      ? "bg-tg-button text-tg-button-text"
                      : "bg-tg-bg text-tg-hint",
                  ].join(" ")}
                >
                  {value} · {label}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={rpe}
                onChange={(e) => setRpe(Number(e.target.value) || 7)}
                className="min-w-0 flex-1"
                aria-label="Оценка сложности тренировки от 1 до 10"
              />
              <span className="w-8 text-center text-sm font-semibold tabular-nums">{rpe}</span>
            </div>
            <p className="mt-1 text-[10px] text-tg-hint">
              Подсказка: комфортная рабочая тренировка обычно 6–8. Если часто 9–10 —
              снизьте вес или объём на следующей неделе.
            </p>
          </div>
          <label className="block text-xs text-tg-hint">
            Заметки к тренировке
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Как самочувствие, что мешало, что получилось лучше…"
              className="mt-1 w-full rounded-lg border border-black/10 bg-tg-secondary px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={completing}
            onClick={() => void finishWorkout()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-60"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-current">
              <span className="block h-2.5 w-2.5 rounded-[1px] bg-current" />
            </span>
            {completing ? "Сохраняем…" : "Завершить тренировку"}
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-tg-secondary p-3 text-xs text-tg-hint">
          Завершение доступно на последнем упражнении. Сейчас{" "}
          {Math.min(currentExerciseIndex + 1, exerciseIds.length || 1)} из{" "}
          {exerciseIds.length || 1}. Кнопка «стоп» (у таймера и снизу справа) перенесёт
          на финиш.
        </div>
      )}

      {/* Always-visible floating stop control (duplicates header stop) */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 mx-auto flex w-full max-w-lg justify-end px-4">
        <button
          type="button"
          onClick={scrollToFinish}
          disabled={completing}
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg disabled:opacity-50"
          aria-label="Стоп — завершить тренировку"
          title="Завершить"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white">
            <span className="block h-4 w-4 rounded-[2px] bg-white" />
          </span>
        </button>
      </div>
    </section>
  );
}
