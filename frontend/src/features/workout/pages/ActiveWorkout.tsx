import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { addWorkoutSet, completeWorkout } from "@/api/workouts";
import { Header } from "@/components/layout/Header";
import {
  deleteLocalSession,
  enqueueSync,
  flushSyncQueue,
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
import { isOnline } from "@/utils/network";

function asPlan(raw: Workout["plan"]): WorkoutPlan {
  if (!raw || typeof raw !== "object") return { exercises: [] };
  const plan = raw as WorkoutPlan;
  return {
    title: plan.title ?? null,
    workout_type: plan.workout_type ?? null,
    day_index: plan.day_index ?? null,
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
  const tickRest = useWorkoutStore((s) => s.tickRest);
  const stopRest = useWorkoutStore((s) => s.stopRest);
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

  const completedCount = drafts.filter((d) => d.isCompleted).length;
  const targetReps =
    plan.exercises.find((e) => e.exercise_id === currentExerciseId)?.target_reps ?? "8-12";

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

  const apiWorkoutId = useCallback(async () => {
    const state = useWorkoutStore.getState();
    const clientId = state.clientWorkoutId ?? stableClientId;
    if (state.serverWorkoutId) return state.serverWorkoutId;
    return resolveServerWorkoutId(clientId);
  }, [stableClientId]);

  const finishWorkout = useCallback(async () => {
    if (!activeWorkout || completing) return;
    setCompleting(true);
    setError(null);
    setOfflineNote(null);
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
          result = {
            ...activeWorkout,
            status: "completed",
            rpe,
            ai_notes: aiNotes,
            completed_at: new Date().toISOString(),
          };
          await enqueueSync({
            type: "complete_workout",
            clientWorkoutId: clientId,
            payload: { rpe, aiNotes },
          });
          setOfflineNote("Завершение сохранено локально и встанет в очередь синхронизации.");
        }
      } else {
        result = {
          ...activeWorkout,
          status: "completed",
          rpe,
          ai_notes: aiNotes,
          completed_at: new Date().toISOString(),
        };
        await enqueueSync({
          type: "complete_workout",
          clientWorkoutId: clientId,
          payload: { rpe, aiNotes },
        });
        setOfflineNote("Оффлайн: тренировка завершена локально, синхронизация позже.");
      }

      await persistSession(result, drafts);
      setActiveWorkout(result);
      setSummary(
        `Готово. Упражнений: ${exerciseIds.length}. Подходов: ${completedCount}/${drafts.length}. Тоннаж: ${tonnage.toFixed(1)} кг. RPE: ${rpe}.`,
      );
      trackEvent("workout_completed", {
        client_id: clientId,
        exercises: exerciseIds.length,
        sets_completed: completedCount,
        tonnage: Math.round(tonnage),
        rpe,
        offline: !isOnline(),
      });
      hapticNotification("success");
      stopRest();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось завершить тренировку");
    } finally {
      setCompleting(false);
    }
  }, [
    activeWorkout,
    apiWorkoutId,
    completedCount,
    completing,
    drafts,
    exerciseIds.length,
    notes,
    persistSession,
    rpe,
    setActiveWorkout,
    stableClientId,
    stopRest,
  ]);

  useMainButton({
    text: completing ? "Сохраняем…" : "Завершить тренировку",
    visible: Boolean(activeWorkout && activeWorkout.status !== "completed" && !booting),
    enabled: !completing,
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

  if (!activeWorkout) return null;

  if (summary || activeWorkout.status === "completed") {
    return (
      <section>
        <Header title="Тренировка завершена" subtitle="Сводка сессии" />
        <div className="space-y-3 rounded-2xl bg-tg-secondary p-4 text-sm">
          <p>{summary ?? "Тренировка уже завершена."}</p>
          {activeWorkout.ai_notes ? <p className="text-tg-hint">AI: {activeWorkout.ai_notes}</p> : null}
          {offlineNote ? <p className="text-tg-hint">{offlineNote}</p> : null}
        </div>
        <button
          type="button"
          className="mt-4 w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text"
          onClick={() => {
            const clientId = useWorkoutStore.getState().clientWorkoutId ?? stableClientId;
            void deleteLocalSession(clientId);
            resetSession();
            navigate("/progress");
          }}
        >
          К прогрессу
        </button>
      </section>
    );
  }

  return (
    <section>
      <Header
        title={activeWorkout.title || "Активная тренировка"}
        subtitle={`Упражнение ${Math.min(currentExerciseIndex + 1, exerciseIds.length)}/${exerciseIds.length || 1}`}
      />
      {error ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}
      {offlineNote ? (
        <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-xs text-tg-hint">{offlineNote}</div>
      ) : null}

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
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-tg-hint">
                      Вес
                      <input
                        type="number"
                        inputMode="decimal"
                        value={draft.weight}
                        disabled={draft.isCompleted}
                        onChange={(e) =>
                          updateDraft(draft.exerciseId, draft.setNumber, {
                            weight: e.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-black/10 bg-tg-secondary px-3 py-2 text-sm text-tg-text"
                      />
                    </label>
                    <label className="text-xs text-tg-hint">
                      Повторения
                      <input
                        type="number"
                        inputMode="numeric"
                        value={draft.reps}
                        disabled={draft.isCompleted}
                        onChange={(e) =>
                          updateDraft(draft.exerciseId, draft.setNumber, {
                            reps: e.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-black/10 bg-tg-secondary px-3 py-2 text-sm text-tg-text"
                      />
                    </label>
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
              ← Предыдущее
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
              Следующее →
            </button>
          </div>
        </article>
      ) : (
        <p className="text-sm text-tg-hint">В этой тренировке нет упражнений.</p>
      )}

      <RestTimer secondsLeft={restSecondsLeft} isResting={isResting} onSkip={stopRest} />

      <div className="mt-4 space-y-2 rounded-2xl bg-tg-secondary p-4">
        <p className="text-sm font-medium">Перед завершением</p>
        <label className="block text-xs text-tg-hint">
          RPE (1–10)
          <input
            type="number"
            min={1}
            max={10}
            value={rpe}
            onChange={(e) => setRpe(Number(e.target.value) || 7)}
            className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs text-tg-hint">
          Заметки
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
          />
        </label>
        <p className="text-xs text-tg-hint">
          Прогресс: {completedCount}/{drafts.length} подходов · упражнение{" "}
          {Math.min(currentExerciseIndex + 1, exerciseIds.length)}/{exerciseIds.length || 1}
        </p>
      </div>
    </section>
  );
}
