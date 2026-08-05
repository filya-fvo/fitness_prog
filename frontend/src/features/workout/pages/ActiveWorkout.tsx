import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { sendAIChat } from "@/api/ai";
import { fetchExercises } from "@/api/exercises";
import { notifyTimerEnded } from "@/api/notifications";
import { fetchMyProfile, updateMyProfile } from "@/api/users";
import { addWorkoutSet, completeWorkout, fetchWorkoutHistory } from "@/api/workouts";
import { Header } from "@/components/layout/Header";
import {
  cacheExercises,
  deleteLocalSession,
  enqueueSync,
  flushSyncQueue,
  readCachedWorkouts,
  resolveServerWorkoutId,
  saveLocalSession,
} from "@/db/syncQueue";
import { AddSetModal } from "@/features/workout/components/AddSetModal";
import { ExerciseMediaPlayer } from "@/features/workout/components/ExerciseMediaPlayer";
import { WarmupPanel } from "@/features/workout/components/WarmupPanel";
import { RestTimer } from "@/features/workout/components/RestTimer";
import { useMainButton } from "@/features/workout/hooks/useMainButton";
import { trackEvent } from "@/lib/analytics";
import {
  markWorkoutTimerStart,
  msSinceWorkoutTimerStart,
  summarizeFunnel,
} from "@/lib/metrics";
import { findResumableSession, restoreSessionIntoStore } from "@/lib/sessionRestore";
import { hapticImpact, hapticNotification } from "@/lib/telegram";
import { uniqueExerciseIds, useWorkoutStore } from "@/store/workoutStore";
import type { Exercise, Workout, WorkoutPlan, WorkoutSet } from "@/types/workout";
import { formatElapsed } from "@/utils/format";
import {
  buildExerciseHistory,
  draftReadyToComplete,
  localDateKey,
  resolveWeekPhase,
  suggestLoad,
  type WeekPhase,
  type WeekPhaseMeta,
} from "@/utils/loadProgression";
import { isOnline } from "@/utils/network";
import { inferLoadType, formatDurationLabel, defaultTimedSeconds } from "@/utils/exerciseLoadType";
import { advanceCursorAfterWorkout, cursorGoalsPatch, readProgramCursor } from "@/utils/programProgress";
import { buildWarmupPlan } from "@/utils/warmupPlan";
import { fetchPrograms } from "@/api/programs";

function asPlan(raw: Workout["plan"]): WorkoutPlan & {
  warmup_pending?: boolean;
  warmup_location?: string;
} {
  if (!raw || typeof raw !== "object") return { exercises: [] };
  const plan = raw as WorkoutPlan & { warmup_pending?: boolean; warmup_location?: string };
  return {
    title: plan.title ?? null,
    workout_type: plan.workout_type ?? null,
    day_index: plan.day_index ?? null,
    week_phase: plan.week_phase ?? null,
    week_in_cycle: plan.week_in_cycle ?? null,
    week_label: plan.week_label ?? null,
    week_rir: plan.week_rir ?? null,
    exercises: Array.isArray(plan.exercises) ? plan.exercises : [],
    warmup_pending: Boolean(plan.warmup_pending),
    warmup_location: plan.warmup_location,
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
  const setCatalog = useWorkoutStore((s) => s.setCatalog);
  const setDrafts = useWorkoutStore((s) => s.setDrafts);
  const nextExercise = useWorkoutStore((s) => s.nextExercise);
  const prevExercise = useWorkoutStore((s) => s.prevExercise);
  const setCurrentExerciseIndex = useWorkoutStore((s) => s.setCurrentExerciseIndex);
  const resetSession = useWorkoutStore((s) => s.resetSession);
  const replaceExercise = useWorkoutStore((s) => s.replaceExercise);

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
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceQuery, setReplaceQuery] = useState("");
  const [replaceMuscle, setReplaceMuscle] = useState("");
  const [aiAssistOpen, setAiAssistOpen] = useState(false);
  const [aiAssistLoading, setAiAssistLoading] = useState(false);
  const [aiAssistText, setAiAssistText] = useState<string | null>(null);
  const [aiAssistError, setAiAssistError] = useState<string | null>(null);
  const [addSetOpen, setAddSetOpen] = useState(false);
  /** When set, AddSetModal edits this draft set instead of appending a new one. */
  const [editingSetNumber, setEditingSetNumber] = useState<number | null>(null);
  const [warmupDone, setWarmupDone] = useState(false);
  const [lastCardioId, setLastCardioId] = useState<string | null>(null);
  const [lastCardioDur, setLastCardioDur] = useState<number | null>(null);
  const [lastCardioParams, setLastCardioParams] = useState<Record<string, string | number> | null>(null);
  const restNotifySentRef = useRef(false);
  const [restContext, setRestContext] = useState<{
    exerciseName: string;
    nextExerciseName: string | null;
    isLastSetOfExercise: boolean;
    isLastExercise: boolean;
  } | null>(null);

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
        if (!cancelled) {
          setBooting(false);
          markWorkoutTimerStart();
        }
        // still refresh cardio prefs in background
      }
      if (isOnline()) {
        try {
          const profile = await fetchMyProfile();
          const g = (profile.goals as Record<string, unknown>) || {};
          if (!cancelled) {
            setLastCardioId(
              g.last_warmup_cardio_exercise_id
                ? String(g.last_warmup_cardio_exercise_id)
                : null,
            );
            setLastCardioDur(Number(g.last_warmup_cardio_duration_sec) || null);
            const lp = g.last_warmup_cardio_params;
            setLastCardioParams(
              lp && typeof lp === "object"
                ? (lp as Record<string, string | number>)
                : null,
            );
          }
        } catch {
          /* soft */
        }
      }
      if (state.activeWorkout && matches) {
        return;
      }
      const session = await findResumableSession();
      if (
        session &&
        (session.clientId === routeId || session.serverId === routeId || session.workout.id === routeId)
      ) {
        await restoreSessionIntoStore(session);
        if (!cancelled) {
          setBooting(false);
          markWorkoutTimerStart();
        }
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

  // Refresh exercise catalog (GIF URLs etc.) so IndexedDB cache is not stale.
  useEffect(() => {
    if (!isOnline()) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await fetchExercises({ pageSize: 200 });
        if (cancelled || !result.items.length) return;
        setCatalog(result.items);
        await cacheExercises(result.items);
      } catch {
        /* soft */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setCatalog, workoutId]);

  useEffect(() => {
    if (!isResting) {
      restNotifySentRef.current = false;
      return;
    }
    const timer = window.setInterval(() => {
      const before = useWorkoutStore.getState().restSecondsLeft;
      tickRest();
      if (before <= 1 && !restNotifySentRef.current) {
        restNotifySentRef.current = true;
        hapticImpact("medium");
        hapticNotification("success");
        const ctx = restContext;
        const title = "Отдых завершён";
        let text = "Ваш отдых завершён! Время продолжить тренировку 💪";
        if (ctx) {
          if (ctx.isLastSetOfExercise && ctx.nextExerciseName) {
            text = `Отдых завершён! Дальше: ${ctx.nextExerciseName} 💪`;
          } else if (ctx.isLastSetOfExercise && ctx.isLastExercise) {
            text = "Отдых завершён! Это было последнее упражнение — можно завершать тренировку 🏁";
          } else {
            text = `Отдых завершён! Продолжайте: ${ctx.exerciseName} 💪`;
          }
        }
        if (isOnline()) {
          void notifyTimerEnded({
            kind: "rest",
            title,
            text,
            workoutId: useWorkoutStore.getState().serverWorkoutId || activeWorkout?.id,
            startapp: "home",
          }).catch(() => {
            /* soft fail */
          });
        }
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeWorkout?.id, isResting, restContext, tickRest]);

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

  const showWarmup = Boolean((plan as { warmup_pending?: boolean }).warmup_pending) && !warmupDone;
  const warmupPlanBuilt = useMemo(() => {
    if (!showWarmup) return null;
    const loc = String((plan as { warmup_location?: string }).warmup_location || "gym");
    return buildWarmupPlan({
      location: loc,
      plan,
      catalog,
      lastCardioExerciseId: lastCardioId,
      lastCardioDurationSec: lastCardioDur,
    });
  }, [catalog, lastCardioDur, lastCardioId, plan, showWarmup]);

  const currentLoadType = currentExercise ? inferLoadType(currentExercise) : "weight_reps";

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

  const hasReplacements = useMemo(() => {
    return plan.exercises.some(
      (e) => e.original_exercise_id && e.original_exercise_id !== e.exercise_id,
    );
  }, [plan.exercises]);

  const occupiedExerciseIds = useMemo(() => new Set(exerciseIds), [exerciseIds]);

  const recommendedAlternatives = useMemo(() => {
    if (!currentExercise) return [] as Exercise[];
    const muscle = (currentExercise.muscle_group || "").toLowerCase();
    const equip = (currentExercise.equipment || "").toLowerCase();
    const tags = new Set((currentExercise.tags || []).map((t) => t.toLowerCase()));
    return catalog
      .filter((ex) => ex.id !== currentExercise.id && !occupiedExerciseIds.has(ex.id))
      .map((ex) => {
        let score = 0;
        if (muscle && (ex.muscle_group || "").toLowerCase() === muscle) score += 5;
        if (equip && (ex.equipment || "").toLowerCase() === equip) score += 2;
        for (const t of ex.tags || []) {
          if (tags.has(t.toLowerCase())) score += 1;
        }
        return { ex, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.ex.name_ru.localeCompare(b.ex.name_ru, "ru"))
      .slice(0, 8)
      .map((x) => x.ex);
  }, [catalog, currentExercise, occupiedExerciseIds]);

  const replaceCatalog = useMemo(() => {
    if (!currentExercise) return [] as Exercise[];
    const q = replaceQuery.trim().toLowerCase();
    return catalog
      .filter((ex) => ex.id !== currentExercise.id && !occupiedExerciseIds.has(ex.id))
      .filter((ex) => {
        if (replaceMuscle && ex.muscle_group !== replaceMuscle) return false;
        if (!q) return true;
        const hay = [ex.name_ru, ex.muscle_group, ex.equipment || "", ex.description || ""]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 40);
  }, [catalog, currentExercise, occupiedExerciseIds, replaceMuscle, replaceQuery]);

  const replaceMuscleGroups = useMemo(() => {
    const set = new Set(catalog.map((c) => c.muscle_group).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [catalog]);

  const applyReplace = useCallback(
    (ex: Exercise) => {
      if (!currentExerciseId) return;
      const ok = replaceExercise(currentExerciseId, ex);
      if (!ok) {
        setError("Не удалось заменить: упражнение уже есть в тренировке.");
        return;
      }
      setReplaceOpen(false);
      setReplaceQuery("");
      setReplaceMuscle("");
      setError(null);
      hapticImpact("light");
      const next = useWorkoutStore.getState();
      if (next.activeWorkout) {
        void persistSession(next.activeWorkout, next.drafts, next.currentExerciseIndex);
      }
    },
    [currentExerciseId, persistSession, replaceExercise],
  );

  const askAiForCurrent = useCallback(async () => {
    if (!currentExercise || aiAssistLoading) return;
    if (!isOnline()) {
      setAiAssistError("AI доступен только онлайн");
      setAiAssistOpen(true);
      return;
    }
    setAiAssistOpen(true);
    setAiAssistLoading(true);
    setAiAssistError(null);
    setAiAssistText(null);
    const alts = recommendedAlternatives
      .slice(0, 5)
      .map((e) => e.name_ru)
      .join(", ");
    const msg =
      `Сейчас в тренировке упражнение «${currentExercise.name_ru}» ` +
      `(${currentExercise.muscle_group || "мышца ?"}${currentExercise.equipment ? `, ${currentExercise.equipment}` : ""}). ` +
      `Предложи 2–3 безопасные замены из похожих движений` +
      (alts ? ` (кандидаты: ${alts})` : "") +
      `. Кратко: почему и на что обратить внимание в технике. Ответ на русском, коротко.`;
    try {
      const result = await sendAIChat({ message: msg });
      setAiAssistText(result.reply);
    } catch (err) {
      setAiAssistError(err instanceof Error ? err.message : "AI недоступен");
    } finally {
      setAiAssistLoading(false);
    }
  }, [aiAssistLoading, currentExercise, recommendedAlternatives]);

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
    // Allow finish from any exercise (user may end early).
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

      // Advance program day + week phase after full split cycle
      try {
        if (activeWorkout.program_id && isOnline()) {
          const [profile, programs] = await Promise.all([
            fetchMyProfile().catch(() => null),
            fetchPrograms({ templatesOnly: true }).catch(() => ({ items: [] })),
          ]);
          const goals = (profile?.goals as Record<string, unknown>) || {};
          const prog = programs.items.find((x) => x.id === activeWorkout.program_id) || null;
          if (prog) {
            const dayIndex = Number(plan.day_index) || 1;
            const phase = (
              plan.week_phase === "light" ||
              plan.week_phase === "medium" ||
              plan.week_phase === "heavy"
                ? plan.week_phase
                : weekPhase.phase
            ) as WeekPhase;
            const cur = readProgramCursor(goals, prog);
            const next = advanceCursorAfterWorkout(prog, cur, dayIndex, phase);
            const patch = cursorGoalsPatch(
              prog.id,
              {
                nextDayIndex: next.nextDayIndex,
                weekPhase: next.weekPhase,
                phaseSource: next.phaseSource,
                workoutsInPhase: next.workoutsInPhase,
                startedAt: String(goals.active_program_started_at || localDateKey()),
              },
              localDateKey(),
            );
            await updateMyProfile({ goals: { ...goals, ...patch } });
          }
        }
      } catch {
        // soft fail
      }

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
    drafts,
    elapsedSec,
    exerciseIds,
    notes,
    persistSession,
    plan.day_index,
    plan.week_phase,
    resetSession,
    rpe,
    setActiveWorkout,
    stableClientId,
    weekPhase.label,
    weekPhase.phase,
  ]);

  const scrollToFinish = useCallback(() => {
    // Jump to last exercise so the finish panel is in context, then scroll.
    if (exerciseIds.length > 0 && currentExerciseIndex < exerciseIds.length - 1) {
      setCurrentExerciseIndex(exerciseIds.length - 1);
    }
    window.setTimeout(() => {
      const el = document.getElementById("workout-finish-panel");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, [currentExerciseIndex, exerciseIds.length, setCurrentExerciseIndex]);

  useMainButton({
    text: completing ? "Сохраняем…" : "Завершить тренировку",
    visible: Boolean(
      activeWorkout && activeWorkout.status !== "completed" && !booting && !summary,
    ),
    enabled: !completing,
    onClick: () => {
      void finishWorkout();
    },
  });

  async function completeSet(
    exerciseId: string,
    setNumberInput: number,
    overrides?: Partial<{
      reps: string;
      weight: string;
      durationSec: number | null;
      restTimeSec: number;
      note: string | null;
      machineParams: Record<string, string | number> | null;
    }>,
  ) {
    if (!activeWorkout) return;
    let setNumber = setNumberInput;
    // Always read latest drafts from store (modal apply must not race with stale closure).
    const liveDrafts = useWorkoutStore.getState().drafts;
    let draft = liveDrafts.find((d) => d.exerciseId === exerciseId && d.setNumber === setNumber);
    if (!draft && overrides) {
      // create on the fly
      addDraftSet(exerciseId, {
        reps: overrides.reps,
        weight: overrides.weight,
        durationSec: overrides.durationSec,
        restTimeSec: overrides.restTimeSec,
        note: overrides.note,
        machineParams: overrides.machineParams,
      });
      draft = useWorkoutStore.getState().drafts.find(
        (d) => d.exerciseId === exerciseId && !d.isCompleted,
      );
      if (draft && setNumber !== draft.setNumber) {
        setNumber = draft.setNumber;
      }
    }
    if (!draft) return;
    if (overrides) {
      updateDraft(exerciseId, draft.setNumber, {
        reps: overrides.reps ?? draft.reps,
        weight: overrides.weight ?? draft.weight,
        durationSec: overrides.durationSec ?? draft.durationSec,
        restTimeSec: overrides.restTimeSec ?? draft.restTimeSec,
        note: overrides.note ?? draft.note,
        machineParams: overrides.machineParams ?? draft.machineParams,
      });
      draft = {
        ...draft,
        ...overrides,
        setNumber: draft.setNumber,
        exerciseId,
      } as typeof draft;
      setNumber = draft.setNumber;
    }
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

      const baseDrafts = useWorkoutStore.getState().drafts;
      const nextDrafts = baseDrafts.map((d) =>
        d.exerciseId === exerciseId && d.setNumber === setNumber
          ? {
              ...d,
              isCompleted: true,
              reps: draft.reps,
              weight: draft.weight,
              durationSec: draft.durationSec,
              note: draft.note,
              machineParams: draft.machineParams,
              restTimeSec,
            }
          : d,
      );
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

      const msFromStart = msSinceWorkoutTimerStart();
      const completedSetsNow = nextDrafts.filter((d) => d.isCompleted).length;
      trackEvent("set_logged", {
        exercise_id: exerciseId,
        set_number: setNumber,
        completed_sets: completedSetsNow,
        ms_from_workout_start: msFromStart,
        offline: !serverSet,
      });
      // activation = first successful set after onboarding (local funnel)
      try {
        const funnel = summarizeFunnel();
        if (funnel.onboardingCompleted && completedSetsNow === 1 && !funnel.counts.activation_completed) {
          trackEvent("activation_completed", {
            source: "first_set",
            ms_from_workout_start: msFromStart,
          });
        }
      } catch {
        /* soft */
      }

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

      
      {showWarmup && warmupPlanBuilt ? (
        <div className="mb-4">
          <WarmupPanel
            plan={warmupPlanBuilt}
            catalog={catalog}
            lastCardioParams={lastCardioParams}
            onSkipAll={() => {
              setWarmupDone(true);
              if (activeWorkout) {
                const nextPlan = { ...(asPlan(activeWorkout.plan) as object), warmup_pending: false };
                const w = { ...activeWorkout, plan: nextPlan as Workout["plan"] };
                setActiveWorkout(w);
                void persistSession(w, drafts);
              }
            }}
            onCompleteAll={async (payload) => {
              setWarmupDone(true);
              if (activeWorkout) {
                const nextPlan = {
                  ...(asPlan(activeWorkout.plan) as object),
                  warmup_pending: false,
                  warmup_log: payload.cardio || null,
                };
                const w = { ...activeWorkout, plan: nextPlan as Workout["plan"] };
                setActiveWorkout(w);
                void persistSession(w, drafts);
              }
              // Remember last cardio machine in profile goals
              if (payload.cardio && isOnline()) {
                try {
                  const profile = await fetchMyProfile();
                  const goals = (profile.goals as Record<string, unknown>) || {};
                  await updateMyProfile({
                    goals: {
                      ...goals,
                      last_warmup_cardio_exercise_id: payload.cardio.exerciseId,
                      last_warmup_cardio_duration_sec: payload.cardio.durationSec,
                      last_warmup_cardio_params: payload.cardio.params,
                    },
                  });
                } catch {
                  /* soft */
                }
              }
            }}
          />
        </div>
      ) : null}

      <div className="mb-3 rounded-xl bg-tg-secondary px-3 py-2 text-xs text-tg-hint">
        Неделя {weekPhase.weekInCycle}/3 · {weekPhase.label}: цель {weekPhase.defaultReps} повт.,{" "}
        {weekPhase.rir}. Вес: −/+ 1 кг, тонко −/+ 100 г.
        {hasReplacements
          ? " Есть замены — вернуть исходные можно на Главной в блоке «Сегодня»."
          : ""}
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
                "tap-target-x shrink-0 rounded-full px-3 py-2 text-xs min-h-[44px]",
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
              <p className="mt-1 text-xs text-tg-hint">
                {currentLoadType === "timed" || currentLoadType === "cardio_machine"
                  ? "Формат: по времени"
                  : currentLoadType === "reps_only"
                    ? `Цель: ${targetReps} повт.`
                    : `Цель: ${targetReps} повт. · ${weekPhase.label}`}
              </p>
              {suggestNote ? (
                <p className="mt-1 text-[11px] text-tg-hint">{suggestNote}</p>
              ) : null}
              {plan.exercises.find((e) => e.exercise_id === currentExercise.id)?.original_exercise_id ? (
                <p className="mt-1 text-[10px] text-tg-hint">Заменено (можно вернуть по умолчанию)</p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <button
                type="button"
                className="text-xs text-tg-link"
                onClick={() => {
                  setReplaceOpen(true);
                  setReplaceQuery("");
                  setReplaceMuscle(currentExercise.muscle_group || "");
                }}
              >
                Заменить
              </button>
              <button
                type="button"
                className="text-xs text-tg-link"
                disabled={aiAssistLoading}
                onClick={() => void askAiForCurrent()}
              >
                {aiAssistLoading ? "AI…" : "AI: замена"}
              </button>
            </div>
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

          <div className="space-y-2">
            {currentSets.map((draft) => {
              const key = `${draft.exerciseId}:${draft.setNumber}`;
              const dur = draft.durationSec;
              const ready = draftReadyToComplete(draft, currentLoadType);
              return (
                <div
                  key={key}
                  className={[
                    "flex items-center justify-between rounded-xl bg-tg-bg px-3 py-2 text-sm",
                    draft.isCompleted ? "opacity-80" : "",
                  ].join(" ")}
                >
                  <div>
                    <p className="text-xs text-tg-hint">Подход {draft.setNumber}</p>
                    <p className="font-medium">
                      {currentLoadType === "weight_reps"
                        ? `${draft.weight || "—"} кг × ${draft.reps || "—"}`
                        : currentLoadType === "reps_only"
                          ? `${draft.reps || "—"} повт.`
                          : formatDurationLabel(Number(dur) || 0)}
                      {draft.note ? ` · ${draft.note}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {draft.isCompleted ? (
                      <span className="text-xs text-tg-hint">✓</span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="tap-target-x min-h-[44px] rounded-lg bg-tg-secondary px-3 py-2 text-xs font-medium"
                          onClick={() => {
                            setEditingSetNumber(draft.setNumber);
                            setAddSetOpen(true);
                          }}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          disabled={savingKey === key || !ready}
                          onClick={() => {
                            if (!ready) {
                              setEditingSetNumber(draft.setNumber);
                              setAddSetOpen(true);
                              return;
                            }
                            void completeSet(draft.exerciseId, draft.setNumber);
                          }}
                          className="tap-target-x min-h-[44px] rounded-lg bg-tg-button px-3 py-2 text-xs font-semibold text-tg-button-text disabled:opacity-50"
                        >
                          {savingKey === key ? "…" : "Готово"}
                        </button>
                      </>
                    )}
                    {!draft.isCompleted && currentSets.length > 1 ? (
                      <button
                        type="button"
                        className="text-[10px] text-tg-hint"
                        onClick={() => {
                          removeDraftSet(draft.exerciseId, draft.setNumber);
                          const next = useWorkoutStore.getState();
                          if (next.activeWorkout) void persistSession(next.activeWorkout, next.drafts);
                        }}
                      >
                        ✕
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setRestContext({
                  exerciseName: currentExercise.name_ru,
                  nextExerciseName: null,
                  isLastSetOfExercise: false,
                  isLastExercise: false,
                });
                startRest(currentRestSec);
              }}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-tg-bg text-lg"
              aria-label="Таймер отдыха"
              title="Таймер"
            >
              ⏱
            </button>
            <button
              type="button"
              onClick={() => {
                // Repeat last completed set values into a new draft, then open modal if empty
                const done = [...currentSets].filter((d) => d.isCompleted).sort((a, b) => b.setNumber - a.setNumber)[0];
                const open = currentSets.find((d) => !d.isCompleted);
                if (done && open) {
                  updateDraft(open.exerciseId, open.setNumber, {
                    reps: done.reps,
                    weight: done.weight,
                    durationSec: done.durationSec,
                    restTimeSec: done.restTimeSec,
                    machineParams: done.machineParams,
                  });
                  void completeSet(open.exerciseId, open.setNumber, {
                    reps: done.reps,
                    weight: done.weight,
                    durationSec: done.durationSec,
                    restTimeSec: done.restTimeSec,
                    machineParams: done.machineParams,
                  });
                  return;
                }
                if (done) {
                  addDraftSet(currentExercise.id, {
                    reps: done.reps,
                    weight: done.weight,
                    durationSec: done.durationSec,
                    restTimeSec: done.restTimeSec,
                    machineParams: done.machineParams,
                  });
                  const created = [...useWorkoutStore.getState().drafts]
                    .filter((d) => d.exerciseId === currentExercise.id && !d.isCompleted)
                    .sort((a, b) => b.setNumber - a.setNumber)[0];
                  if (created) {
                    void completeSet(created.exerciseId, created.setNumber, {
                      reps: done.reps,
                      weight: done.weight,
                      durationSec: done.durationSec,
                      restTimeSec: done.restTimeSec,
                      machineParams: done.machineParams,
                    });
                  }
                  return;
                }
                setEditingSetNumber(null);
                setAddSetOpen(true);
              }}
              className="rounded-full bg-tg-secondary px-3 py-3 text-xs font-semibold"
            >
              Как прошлый
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingSetNumber(null);
                setAddSetOpen(true);
              }}
              className="flex-1 rounded-full bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text"
            >
              Добавить +
            </button>
          </div>
          <p className="text-[11px] text-tg-hint">
            План: {plan.exercises.find((e) => e.exercise_id === currentExercise.id)?.target_sets ?? "—"}{" "}
            подх. × {targetReps}. «Готово» — если поля заполнены; иначе «Изменить».
          </p>

          {addSetOpen ? (
            <AddSetModal
              open={addSetOpen}
              exercise={currentExercise}
              defaultRestSec={currentRestSec}
              initial={(() => {
                const editing =
                  editingSetNumber != null
                    ? currentSets.find((d) => d.setNumber === editingSetNumber)
                    : null;
                const openDraft = currentSets.find((d) => !d.isCompleted);
                const base = editing || openDraft || currentSets[0];
                return {
                  reps: base?.reps || "",
                  weight: base?.weight || "",
                  durationSec: base?.durationSec || defaultTimedSeconds(currentExercise),
                  restTimeSec: base?.restTimeSec || currentRestSec,
                  machineParams: base?.machineParams || null,
                  note: base?.note || "",
                };
              })()}
              onClose={() => {
                setAddSetOpen(false);
                setEditingSetNumber(null);
              }}
              onStartTimerOnly={(seconds) => {
                setRestContext({
                  exerciseName: currentExercise.name_ru,
                  nextExerciseName: null,
                  isLastSetOfExercise: false,
                  isLastExercise: false,
                });
                startRest(seconds);
                setAddSetOpen(false);
                setEditingSetNumber(null);
              }}
              onApply={(vals) => {
                const targetSet = editingSetNumber;
                setAddSetOpen(false);
                setEditingSetNumber(null);
                if (targetSet != null) {
                  // Edit existing draft set in place, then complete it.
                  updateDraft(currentExercise.id, targetSet, {
                    reps: vals.reps,
                    weight: vals.weight,
                    durationSec: vals.durationSec,
                    note: vals.note,
                    machineParams: vals.machineParams,
                    restTimeSec: vals.restTimeSec,
                  });
                  const next = useWorkoutStore.getState();
                  if (next.activeWorkout) void persistSession(next.activeWorkout, next.drafts);
                  void completeSet(currentExercise.id, targetSet, {
                    reps: vals.reps,
                    weight: vals.weight,
                    durationSec: vals.durationSec,
                    note: vals.note,
                    machineParams: vals.machineParams,
                    restTimeSec: vals.restTimeSec,
                  });
                  return;
                }
                // Append a new set with entered values, then complete it.
                addDraftSet(currentExercise.id, {
                  reps: vals.reps,
                  weight: vals.weight,
                  durationSec: vals.durationSec,
                  note: vals.note,
                  machineParams: vals.machineParams,
                  restTimeSec: vals.restTimeSec,
                });
                const next = useWorkoutStore.getState();
                const created = [...next.drafts]
                  .filter((d) => d.exerciseId === currentExercise.id)
                  .sort((a, b) => b.setNumber - a.setNumber)[0];
                if (next.activeWorkout) void persistSession(next.activeWorkout, next.drafts);
                if (created) {
                  void completeSet(created.exerciseId, created.setNumber, {
                    reps: vals.reps,
                    weight: vals.weight,
                    durationSec: vals.durationSec,
                    note: vals.note,
                    machineParams: vals.machineParams,
                    restTimeSec: vals.restTimeSec,
                  });
                } else if (vals.startTimer) {
                  startRest(vals.restTimeSec);
                }
              }}
            />
          ) : null}

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

      <div id="workout-finish-panel" className="mt-4 space-y-2">
        <div className="rounded-xl bg-tg-secondary p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Завершение тренировки</p>
            <p className="text-sm font-semibold tabular-nums text-tg-hint">
              {formatElapsed(elapsedSec)}
            </p>
          </div>
          {!isLastExercise ? (
            <p className="mb-2 text-xs text-tg-hint">
              Упр. {Math.min(currentExerciseIndex + 1, exerciseIds.length || 1)} из{" "}
              {exerciseIds.length || 1}. Можно завершить досрочно.
            </p>
          ) : null}
          <label className="block text-sm font-medium text-tg-text">
            Насколько тяжело было? (оценка 1–10)
          </label>
          <p className="mt-1 text-xs text-tg-hint">
            Это субъективная оценка усилия всей тренировки. Нужна, чтобы видеть, как вы
            переносите нагрузку, и не перетренироваться. 1 — очень легко, 10 — максимум,
            почти не смогли закончить.
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
            Подсказка: комфортная рабочая тренировка обычно 6–8. Если часто 9–10 — снизьте
            вес или объём на следующей неделе.
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

      {replaceOpen && currentExercise ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl bg-tg-bg shadow-xl">
            <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Замена упражнения</p>
                <p className="text-xs text-tg-hint">Сейчас: {currentExercise.name_ru}</p>
              </div>
              <button
                type="button"
                className="text-sm text-tg-link"
                onClick={() => setReplaceOpen(false)}
              >
                Закрыть
              </button>
            </div>
            <div className="space-y-3 overflow-y-auto p-4" style={{ maxHeight: "70vh" }}>
              {recommendedAlternatives.length ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-tg-hint">Рекомендуемые замены</p>
                  <div className="space-y-2">
                    {recommendedAlternatives.map((ex) => (
                      <button
                        key={`rec-${ex.id}`}
                        type="button"
                        onClick={() => applyReplace(ex)}
                        className="flex w-full items-start justify-between gap-2 rounded-xl bg-tg-secondary px-3 py-2 text-left"
                      >
                        <span>
                          <span className="block text-sm font-medium">{ex.name_ru}</span>
                          <span className="block text-[11px] text-tg-hint">
                            {ex.muscle_group}
                            {ex.equipment ? ` · ${ex.equipment}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-tg-link">Выбрать</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-tg-hint">
                  Нет близких рекомендаций — выберите из каталога ниже.
                </p>
              )}

              <label className="block text-xs text-tg-hint">
                Поиск по каталогу
                <input
                  type="search"
                  value={replaceQuery}
                  onChange={(e) => setReplaceQuery(e.target.value)}
                  placeholder="Название, мышца, инвентарь"
                  className="mt-1 w-full rounded-xl border border-black/10 bg-tg-secondary px-3 py-2 text-sm"
                />
              </label>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setReplaceMuscle("")}
                  className={[
                    "rounded-full px-2.5 py-1 text-[11px]",
                    !replaceMuscle ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary text-tg-hint",
                  ].join(" ")}
                >
                  Все
                </button>
                {replaceMuscleGroups.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setReplaceMuscle(g)}
                    className={[
                      "rounded-full px-2.5 py-1 text-[11px]",
                      replaceMuscle === g
                        ? "bg-tg-button text-tg-button-text"
                        : "bg-tg-secondary text-tg-hint",
                    ].join(" ")}
                  >
                    {g}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                {replaceCatalog.length === 0 ? (
                  <p className="text-xs text-tg-hint">Ничего не найдено.</p>
                ) : (
                  replaceCatalog.map((ex) => (
                    <button
                      key={`all-${ex.id}`}
                      type="button"
                      onClick={() => applyReplace(ex)}
                      className="flex w-full items-start justify-between gap-2 rounded-xl bg-tg-secondary px-3 py-2 text-left"
                    >
                      <span>
                        <span className="block text-sm font-medium">{ex.name_ru}</span>
                        <span className="block text-[11px] text-tg-hint">
                          {ex.muscle_group}
                          {ex.equipment ? ` · ${ex.equipment}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-tg-link">Выбрать</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {aiAssistOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
          <div className="w-full max-w-lg rounded-2xl bg-tg-bg p-4 shadow-xl">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">AI · замена упражнения</p>
              <button
                type="button"
                className="text-sm text-tg-link"
                onClick={() => setAiAssistOpen(false)}
              >
                Закрыть
              </button>
            </div>
            {currentExercise ? (
              <p className="mb-2 text-xs text-tg-hint">Сейчас: {currentExercise.name_ru}</p>
            ) : null}
            {aiAssistError ? (
              <p className="mb-2 text-sm text-amber-800">{aiAssistError}</p>
            ) : null}
            {aiAssistLoading ? (
              <p className="text-sm text-tg-hint">Думаю…</p>
            ) : aiAssistText ? (
              <p className="whitespace-pre-wrap text-sm">{aiAssistText}</p>
            ) : null}
            {recommendedAlternatives.length ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-medium text-tg-hint">Быстрый выбор</p>
                {recommendedAlternatives.slice(0, 4).map((ex) => (
                  <button
                    key={`ai-alt-${ex.id}`}
                    type="button"
                    onClick={() => {
                      applyReplace(ex);
                      setAiAssistOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-xl bg-tg-secondary px-3 py-2 text-left text-sm"
                  >
                    <span>{ex.name_ru}</span>
                    <span className="text-xs text-tg-link">Заменить</span>
                  </button>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              className="mt-3 w-full rounded-xl bg-tg-secondary px-3 py-2 text-sm"
              onClick={() => {
                setAiAssistOpen(false);
                setReplaceOpen(true);
                setReplaceQuery("");
                setReplaceMuscle(currentExercise?.muscle_group || "");
              }}
            >
              Открыть полный список замен
            </button>
          </div>
        </div>
      ) : null}

    </section>
  );
}
