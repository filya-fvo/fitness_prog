import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useRef } from "react";
import { sendAIChat } from "@/api/ai";
import { getStoredToken } from "@/api/client";
import { fetchExercises } from "@/api/exercises";
import { fetchMyProfile, updateMyProfile } from "@/api/users";
import { addWorkoutSet, completeWorkout, deleteWorkout, fetchWorkout, fetchWorkoutHistory } from "@/api/workouts";
import { Header } from "@/components/layout/Header";
import {
  cacheExercises,
  deleteLocalSession,
  enqueueSync,
  flushSyncQueue,
  readCachedWorkouts,
  removeCachedWorkout,
  resolveServerWorkoutId,
  saveLocalSession,
  syncWorkoutPlan,
} from "@/db/syncQueue";
import { AddSetModal } from "@/features/workout/components/AddSetModal";
import { ExerciseMediaPlayer } from "@/features/workout/components/ExerciseMediaPlayer";
import { RestTimerHost } from "@/features/workout/components/RestTimerHost";
import { WarmupPanel } from "@/features/workout/components/WarmupPanel";
import { WorkoutElapsedClock } from "@/features/workout/components/WorkoutElapsedClock";
import { useMainButton } from "@/features/workout/hooks/useMainButton";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import { trackEvent } from "@/lib/analytics";
import {
  markWorkoutTimerStart,
  msSinceWorkoutTimerStart,
  summarizeFunnel,
} from "@/lib/metrics";
import { findResumableSession, restoreSessionIntoStore } from "@/lib/sessionRestore";
import { confirmAction, hapticImpact, hapticNotification } from "@/lib/telegram";
import { toast } from "@/store/toastStore";
import { useUserStore } from "@/store/userStore";
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
import {
  buildBulkReplacementPlan,
  equipmentGroup,
  type BulkReplacementPlan,
} from "@/utils/exerciseAlternatives";
import { advanceCursorAfterWorkout, cursorGoalsPatch, readProgramCursor } from "@/utils/programProgress";
import { buildWarmupPlan } from "@/utils/warmupPlan";
import {
  draftsFromWorkoutSnapshot,
  isPlannedExerciseComplete,
  shouldStartRestAfterSet,
} from "@/utils/workoutSession";
import { fetchPrograms } from "@/api/programs";
import { toUserMessage } from "@/utils/errors";
import { enumLabel, programDayLabel } from "@/utils/localization";

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
    location: plan.location ?? null,
    equipment: Array.isArray(plan.equipment) ? plan.equipment : [],
    limitations: Array.isArray(plan.limitations) ? plan.limitations : [],
    exercises: Array.isArray(plan.exercises) ? plan.exercises : [],
    warmup_pending: Boolean(plan.warmup_pending),
    warmup_location: plan.warmup_location,
  };
}

const AUTO_ADVANCE_STORAGE_KEY = "fitness_auto_advance_exercises";

function readCachedAutoAdvance(): boolean {
  try {
    const value = localStorage.getItem(AUTO_ADVANCE_STORAGE_KEY);
    return value === "1" || value === "true";
  } catch {
    return false;
  }
}

function cacheAutoAdvance(value: boolean): void {
  try {
    localStorage.setItem(AUTO_ADVANCE_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // The server profile remains authoritative when storage is unavailable.
  }
}

export function ActiveWorkout() {
  const { workoutId } = useParams<{ workoutId: string }>();
  const navigate = useNavigate();
  const isAuthLoading = useUserStore((s) => s.isAuthLoading);
  const authenticatedUserId = useUserStore((s) => s.user?.id);
  const canAttemptServerRestore = Boolean(authenticatedUserId) && !isAuthLoading;

  const catalog = useWorkoutStore((s) => s.catalog);
  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const clientWorkoutId = useWorkoutStore((s) => s.clientWorkoutId);
  const drafts = useWorkoutStore((s) => s.drafts);
  const currentExerciseIndex = useWorkoutStore((s) => s.currentExerciseIndex);
  const updateDraft = useWorkoutStore((s) => s.updateDraft);
  const addDraftSet = useWorkoutStore((s) => s.addDraftSet);
  const removeDraftSet = useWorkoutStore((s) => s.removeDraftSet);
  const startRest = useWorkoutStore((s) => s.startRest);
  const setExerciseRest = useWorkoutStore((s) => s.setExerciseRest);
  const setActiveWorkout = useWorkoutStore((s) => s.setActiveWorkout);
  const setCatalog = useWorkoutStore((s) => s.setCatalog);
  const setDrafts = useWorkoutStore((s) => s.setDrafts);
  const nextExercise = useWorkoutStore((s) => s.nextExercise);
  const prevExercise = useWorkoutStore((s) => s.prevExercise);
  const setCurrentExerciseIndex = useWorkoutStore((s) => s.setCurrentExerciseIndex);
  const resetSession = useWorkoutStore((s) => s.resetSession);
  const replaceExercise = useWorkoutStore((s) => s.replaceExercise);
  const replaceExercises = useWorkoutStore((s) => s.replaceExercises);

  const [booting, setBooting] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [rpe, setRpe] = useState(7);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [offlineNote, setOfflineNote] = useState<string | null>(null);
  const [suggestNote, setSuggestNote] = useState<string | null>(null);
  const [elapsedFinalSec, setElapsedFinalSec] = useState<number | null>(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceQuery, setReplaceQuery] = useState("");
  const [replaceMuscle, setReplaceMuscle] = useState("");
  const [bulkReplacementPlan, setBulkReplacementPlan] =
    useState<BulkReplacementPlan | null>(null);
  const [aiAssistOpen, setAiAssistOpen] = useState(false);
  const [aiAssistLoading, setAiAssistLoading] = useState(false);
  const [aiAssistText, setAiAssistText] = useState<string | null>(null);
  const [aiAssistError, setAiAssistError] = useState<string | null>(null);
  const [aiAssistMode, setAiAssistMode] = useState<
    "replace" | "easier" | "no_equipment" | "technique"
  >("replace");
  const [addSetOpen, setAddSetOpen] = useState(false);
  /** When set, AddSetModal edits this draft set instead of appending a new one. */
  const [editingSetNumber, setEditingSetNumber] = useState<number | null>(null);
  const [warmupDone, setWarmupDone] = useState(false);
  const [lastCardioId, setLastCardioId] = useState<string | null>(null);
  const [lastCardioDur, setLastCardioDur] = useState<number | null>(null);
  const [lastCardioParams, setLastCardioParams] = useState<Record<string, string | number> | null>(null);
  const [autoAdvanceExercises, setAutoAdvanceExercises] = useState(readCachedAutoAdvance);
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState<number | null>(null);
  const completingSetsRef = useRef(new Set<string>());
  /** Gym-first UI: large set + Done; extras behind «Ещё». Default on. */
  const [simpleMode, setSimpleMode] = useState(() => {
    try {
      const raw = localStorage.getItem("fitness_workout_simple_mode");
      if (raw === "0" || raw === "false") return false;
    } catch {
      /* ignore */
    }
    return true;
  });
  const [moreOpen, setMoreOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const finishDialogRef = useModalAccessibility(finishOpen, () => setFinishOpen(false));
  const bulkReplaceDialogRef = useModalAccessibility(
    Boolean(bulkReplacementPlan),
    () => setBulkReplacementPlan(null),
  );
  const replaceDialogRef = useModalAccessibility(replaceOpen, () => setReplaceOpen(false));
  const aiAssistDialogRef = useModalAccessibility(aiAssistOpen, () => setAiAssistOpen(false));
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
            const autoAdvance = Boolean(g.auto_advance_exercises);
            setAutoAdvanceExercises(autoAdvance);
            cacheAutoAdvance(autoAdvance);
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
      const session = authenticatedUserId
        ? await findResumableSession(authenticatedUserId)
        : null;
      if (
        session &&
        (session.clientId === routeId || session.serverId === routeId || session.workout.id === routeId)
      ) {
        await restoreSessionIntoStore(session, authenticatedUserId);
        if (!cancelled) {
          setBooting(false);
          markWorkoutTimerStart();
        }
        return;
      }

      // Telegram auth is bootstrapped by Shell in parallel with this route.
      // Wait for it before deciding that a server-only deep link is unavailable.
      if (!canAttemptServerRestore) {
        return;
      }

      if (isOnline() && getStoredToken()) {
        try {
          const remoteWorkout = await fetchWorkout(routeId);
          const remoteDrafts = draftsFromWorkoutSnapshot(remoteWorkout);
          useWorkoutStore.getState().hydrateSession({
            clientId: remoteWorkout.id,
            serverId: remoteWorkout.id,
            workout: remoteWorkout,
            drafts: remoteDrafts,
            currentExerciseIndex: 0,
          });

          if (remoteWorkout.status === "completed") {
            setElapsedFinalSec(remoteWorkout.duration_sec ?? 0);
            setSummary("Эта тренировка уже завершена. Результаты сохранены в прогрессе.");
          } else if (remoteWorkout.status !== "skipped") {
            await saveLocalSession({
              clientId: remoteWorkout.id,
              serverId: remoteWorkout.id,
              workout: remoteWorkout,
              drafts: remoteDrafts,
              currentExerciseIndex: 0,
            });
          }

          if (!cancelled) {
            setBooting(false);
            setError(null);
            markWorkoutTimerStart();
            trackEvent("workout_session_restored", { source: "server" });
          }
          return;
        } catch {
          if (!cancelled) {
            setError("Не удалось открыть тренировку. Возможно, ссылка устарела или сессия недоступна.");
          }
        }
      } else if (!cancelled) {
        setError("Нет локальной копии тренировки. Подключитесь к интернету и откройте ссылку снова.");
      }

      if (!cancelled) {
        setBooting(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [authenticatedUserId, canAttemptServerRestore, navigate, workoutId]);

  // Refresh exercise catalog (GIF URLs etc.) so IndexedDB cache is not stale.
  useEffect(() => {
    if (!isOnline()) return;
    let cancelled = false;
    void (async () => {
      try {
        const pages: Awaited<ReturnType<typeof fetchExercises>>[] = [];
        const first = await fetchExercises({ pageSize: 200, page: 1 });
        pages.push(first);
        const maxPages = Math.min(5, Math.ceil((first.total || 0) / 200) || 1);
        for (let page = 2; page <= maxPages; page += 1) {
          const chunk = await fetchExercises({ pageSize: 200, page }).catch(() => null);
          if (!chunk?.items?.length) break;
          pages.push(chunk);
          if (chunk.items.length < 200) break;
        }
        if (cancelled) return;
        const map = new Map<string, (typeof first.items)[number]>();
        for (const pg of pages) {
          for (const it of pg.items) map.set(it.id, it);
        }
        const items = Array.from(map.values());
        if (!items.length) return;
        setCatalog(items);
        await cacheExercises(items);
      } catch {
        /* soft */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setCatalog, workoutId]);

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

  const persistPlanReplacement = useCallback(
    async (workout: Workout, nextDrafts = drafts, exerciseIndex = currentExerciseIndex) => {
      await persistSession(workout, nextDrafts, exerciseIndex);
      await syncWorkoutPlan({
        clientWorkoutId: useWorkoutStore.getState().clientWorkoutId ?? stableClientId,
        plan: asPlan(workout.plan),
      });
    },
    [currentExerciseIndex, drafts, persistSession, stableClientId],
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
    const tags = new Set((currentExercise.tags || []).map((tg) => tg.toLowerCase()));
    const name = (currentExercise.name_ru || "").toLowerCase();

    const RELATED: Record<string, string[]> = {
      спина: ["спина", "задние дельты", "трапеции", "поясница"],
      грудь: ["грудь", "трицепс", "передние дельты"],
      ноги: ["ноги", "ягодицы", "бицепс бедра", "икры"],
      плечи: ["плечи", "передние дельты", "средние дельты", "задние дельты", "трапеции"],
      бицепс: ["бицепс", "предплечья", "спина"],
      трицепс: ["трицепс", "грудь", "плечи"],
      пресс: ["пресс", "кор", "core"],
      ягодицы: ["ягодицы", "ноги", "бицепс бедра"],
    };
    const related = new Set((RELATED[muscle] || [muscle]).map((x) => x.toLowerCase()).filter(Boolean));

    const KEYWORDS: Array<{ re: RegExp; boost: string[] }> = [
      { re: /тяг|row|pulldown|pull-down|подтяг/, boost: ["тяг", "подтяг", "pulldown", "row", "блок", "пуловер", "pullover"] },
      { re: /жим|press|bench/, boost: ["жим", "press", "развод", "push", "француз"] },
      { re: /присед|squat|выпад|lunge/, boost: ["присед", "выпад", "squat", "lunge"] },
      { re: /станова|deadlift|румын/, boost: ["станова", "румын", "deadlift"] },
      { re: /пуловер|pullover/, boost: ["пуловер", "pullover", "тяг", "блок", "прямыми руками"] },
      { re: /француз|skull|трицепс|triceps/, boost: ["француз", "разгиб", "блок", "узк", "skull"] },
      { re: /махи|развод|fly|raise/, boost: ["махи", "развод", "fly", "raise"] },
    ];
    const nameBoosts = KEYWORDS.filter((k) => k.re.test(name)).flatMap((k) => k.boost);

    return catalog
      .filter((ex) => ex.id !== currentExercise.id && !occupiedExerciseIds.has(ex.id))
      .map((ex) => {
        let score = 0;
        const exMuscle = (ex.muscle_group || "").toLowerCase();
        const exName = (ex.name_ru || "").toLowerCase();
        const exEquip = (ex.equipment || "").toLowerCase();
        if (muscle && exMuscle === muscle) score += 6;
        else if (exMuscle && related.has(exMuscle)) score += 3;
        if (equip && exEquip === equip) score += 2;
        else if (equip && exEquip && (exEquip.includes(equip) || equip.includes(exEquip))) score += 1;
        for (const tg of ex.tags || []) {
          if (tags.has(tg.toLowerCase())) score += 1;
        }
        for (const b of nameBoosts) {
          if (exName.includes(b)) score += 2;
        }
        if (/гантел|штан|barbell|dumbbell/.test(name) && /блок|cable|тренаж|machine|smith/.test(exName + " " + exEquip)) {
          score += 1;
        }
        return { ex, score };
      })
      .filter((x) => x.score >= 3)
      .sort((a, b) => b.score - a.score || a.ex.name_ru.localeCompare(b.ex.name_ru, "ru"))
      .slice(0, 16)
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
      .slice(0, 80);
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
        void persistPlanReplacement(next.activeWorkout, next.drafts, next.currentExerciseIndex);
      }
    },
    [currentExerciseId, persistPlanReplacement, replaceExercise],
  );

  const prepareBulkReplacement = useCallback(() => {
    if (!plan.exercises.length || !catalog.length) {
      setError("Каталог упражнений ещё не загружен.");
      return;
    }
    const completedExerciseIds = new Set([
      ...drafts.filter((draft) => draft.isCompleted).map((draft) => draft.exerciseId),
      ...(activeWorkout?.sets || [])
        .filter((setRow) => setRow.is_completed)
        .map((setRow) => setRow.exercise_id),
    ]);
    const allowedEquipment = new Set((plan.equipment || []).filter(Boolean));
    if (!allowedEquipment.size) {
      for (const item of plan.exercises) {
        const exercise = exerciseMap.get(item.exercise_id);
        if (exercise) allowedEquipment.add(equipmentGroup(exercise));
      }
    }
    const limitations = new Set((plan.limitations || []).filter(Boolean));
    const title = (plan.title || "").toLowerCase();
    if (/no-knee|колен/.test(title)) limitations.add("no_knee");
    if (/spine-safe|позвоноч/.test(title)) limitations.add("no_spine");
    if (/shoulder-safe|щадящ.*плеч/.test(title)) limitations.add("shoulder_sensitive");

    const preview = buildBulkReplacementPlan({
      planExercises: plan.exercises,
      catalog,
      completedExerciseIds,
      allowedEquipment,
      limitations,
    });
    if (!preview.replacements.length) {
      setError("Для незавершённых упражнений не найдено достаточно близких безопасных замен.");
      return;
    }
    setError(null);
    setBulkReplacementPlan(preview);
  }, [activeWorkout?.sets, catalog, drafts, exerciseMap, plan]);

  const applyBulkReplacement = useCallback(() => {
    if (!bulkReplacementPlan) return;
    const count = replaceExercises(
      bulkReplacementPlan.replacements.map((item) => ({
        fromExerciseId: item.fromExercise.id,
        toExercise: item.toExercise,
      })),
    );
    setBulkReplacementPlan(null);
    if (!count) {
      setError("Массовая замена не применена: состав тренировки уже изменился.");
      return;
    }
    const next = useWorkoutStore.getState();
    if (next.activeWorkout) {
      void persistPlanReplacement(next.activeWorkout, next.drafts, next.currentExerciseIndex);
    }
    setError(null);
    hapticNotification("success");
    toast(`Заменено упражнений: ${count}`);
    trackEvent("workout_exercises_bulk_replaced", {
      replaced: count,
      completed_skipped: bulkReplacementPlan.completedSkipped,
      no_equivalent_skipped: bulkReplacementPlan.noEquivalentSkipped,
    });
  }, [bulkReplacementPlan, persistPlanReplacement, replaceExercises]);

  const askAiForCurrent = useCallback(
    async (mode: "replace" | "easier" | "no_equipment" | "technique" = "replace") => {
      if (!currentExercise || aiAssistLoading) return;
      setAiAssistMode(mode);
      if (!isOnline()) {
        setAiAssistError("ИИ-помощник доступен только онлайн");
        setAiAssistOpen(true);
        return;
      }
      setAiAssistOpen(true);
      setAiAssistLoading(true);
      setAiAssistError(null);
      setAiAssistText(null);
      const alts = recommendedAlternatives
        .slice(0, 6)
        .map((e) => e.name_ru)
        .join(", ");
      const base =
        `Сейчас в тренировке упражнение «${currentExercise.name_ru}» ` +
        `(${currentExercise.muscle_group || "мышца ?"}${currentExercise.equipment ? `, ${currentExercise.equipment}` : ""}). `;
      let task = "";
      if (mode === "easier") {
        task =
          "Предложи 2–3 более лёгкие/регрессионные варианта (меньше нагрузка на суставы или проще техника). ";
      } else if (mode === "no_equipment") {
        task =
          "Предложи 2–3 замены с минимальным инвентарём или с весом тела, если зал/тренажёр недоступен. ";
      } else if (mode === "technique") {
        task =
          "Дай 4–6 коротких пунктов техники и 2 частые ошибки. Без воды. ";
      } else {
        task = "Предложи 2–3 безопасные замены из похожих движений. ";
      }
      const msg =
        base +
        task +
        (alts && mode !== "technique" ? `Кандидаты из каталога: ${alts}. ` : "") +
        (mode !== "technique"
          ? "В ответе перечисли названия упражнений в кавычках «…», чтобы их можно было выбрать. "
          : "") +
        "Ответ на русском, коротко, для зала.";
      try {
        const result = await sendAIChat({ message: msg });
        setAiAssistText(result.reply);
      } catch (err) {
        setAiAssistError(toUserMessage(err, "ИИ-тренер временно недоступен"));
      } finally {
        setAiAssistLoading(false);
      }
    },
    [aiAssistLoading, currentExercise, recommendedAlternatives],
  );

  /** Match catalog exercises mentioned in AI reply for one-tap replace. */
  const aiSuggestedExercises = useMemo(() => {
    if (!aiAssistText || !currentExercise) return [] as Exercise[];
    const text = aiAssistText.toLowerCase();
    const scored = catalog
      .filter((ex) => ex.id !== currentExercise.id && !occupiedExerciseIds.has(ex.id))
      .map((ex) => {
        const name = (ex.name_ru || "").trim();
        if (name.length < 4) return { ex, score: 0 };
        const n = name.toLowerCase();
        let score = 0;
        if (text.includes(n)) score += 5;
        // partial: first 2 meaningful words
        const words = n.split(/\s+/).filter((w) => w.length > 3).slice(0, 2);
        if (words.length && words.every((w) => text.includes(w))) score += 2;
        return { ex, score };
      })
      .filter((x) => x.score >= 5)
      .sort((a, b) => b.score - a.score || a.ex.name_ru.localeCompare(b.ex.name_ru, "ru"));
    const seen = new Set<string>();
    const out: Exercise[] = [];
    for (const row of scored) {
      if (seen.has(row.ex.id)) continue;
      seen.add(row.ex.id);
      out.push(row.ex);
      if (out.length >= 6) break;
    }
    return out;
  }, [aiAssistText, catalog, currentExercise, occupiedExerciseIds]);

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
      if (!Number.isFinite(started)) return 0;
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
        `Готово. Время: ${formatElapsed(finalElapsed)}. Упражнений: ${exerciseIds.length}. Подходов: ${completedCount}/${drafts.length}. Объём нагрузки: ${tonnage.toFixed(1)} кг (вес × повторы). Субъективная тяжесть: ${rpe}/10 (RPE). Неделя: ${weekPhase.label}.`,
      );
    } catch (err) {
      setError(toUserMessage(err, "Не удалось завершить тренировку"));
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

  const openFinishDialog = useCallback(() => {
    setFinishOpen(true);
  }, []);

  const discardWorkout = useCallback(async () => {
    if (!activeWorkout || completing) return;
    const confirmed = await confirmAction(
      "Отменить и удалить эту тренировку? Подходы не попадут в прогресс, а день программы не изменится.",
    );
    if (!confirmed) return;
    setCompleting(true);
    setError(null);
    const clientId = useWorkoutStore.getState().clientWorkoutId ?? stableClientId;
    try {
      if (isOnline()) {
        try {
          await flushSyncQueue();
          const workoutId = await apiWorkoutId();
          await deleteWorkout(workoutId);
          await removeCachedWorkout(workoutId);
        } catch {
          await enqueueSync({ type: "delete_workout", clientWorkoutId: clientId, payload: {} });
        }
      } else {
        await enqueueSync({ type: "delete_workout", clientWorkoutId: clientId, payload: {} });
      }
      await removeCachedWorkout(clientId);
      await deleteLocalSession(clientId);
      resetSession();
      hapticNotification("success");
      navigate("/workouts", { replace: true });
    } catch (err) {
      setError(toUserMessage(err, "Не удалось отменить тренировку"));
    } finally {
      setCompleting(false);
    }
  }, [activeWorkout, apiWorkoutId, completing, navigate, resetSession, stableClientId]);

  function toggleSimpleMode() {
    setSimpleMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("fitness_workout_simple_mode", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      if (!next) {
        setMoreOpen(true);
      }
      return next;
    });
  }

  useMainButton({
    text: completing ? "Сохраняем…" : "Завершить тренировку",
    visible: Boolean(
      activeWorkout &&
        activeWorkout.status !== "completed" &&
        !booting &&
        !summary &&
        !aiAssistOpen &&
        !replaceOpen &&
        !bulkReplacementPlan &&
        !finishOpen &&
        !addSetOpen,
    ),
    enabled: !completing,
    onClick: openFinishDialog,
  });

  useEffect(() => {
    if (!aiAssistOpen) return;
    window.requestAnimationFrame(() => {
      aiAssistDialogRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [aiAssistDialogRef, aiAssistMode, aiAssistOpen, aiAssistText]);

  useEffect(() => {
    setMoreOpen(false);
    setAutoAdvanceCountdown(null);
  }, [currentExerciseId]);

  useEffect(() => {
    if (autoAdvanceCountdown == null) return;
    if (autoAdvanceCountdown <= 0) {
      setAutoAdvanceCountdown(null);
      const state = useWorkoutStore.getState();
      state.nextExercise();
      const next = useWorkoutStore.getState();
      if (next.activeWorkout) {
        void persistSession(next.activeWorkout, next.drafts, next.currentExerciseIndex);
      }
      return;
    }
    const timer = window.setTimeout(
      () => setAutoAdvanceCountdown((value) => (value == null ? null : value - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [autoAdvanceCountdown, persistSession]);

  useEffect(() => {
    if (!activeWorkout || ["completed", "skipped"].includes(activeWorkout.status)) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [activeWorkout]);

  async function completeSet(
    exerciseId: string,
    setNumberInput: number,
    overrides?: Partial<{
      reps: string;
      weight: string;
      weightMode: "total" | "per_hand" | null;
      durationSec: number | null;
      restTimeSec: number;
      note: string | null;
      machineParams: Record<string, string | number> | null;
    }>,
  ) {
    if (!activeWorkout) return;
    const restWasActiveAtSubmit = useWorkoutStore.getState().isResting;
    let setNumber = setNumberInput;
    // Always read latest drafts from store (modal apply must not race with stale closure).
    const liveDrafts = useWorkoutStore.getState().drafts;
    let draft = liveDrafts.find((d) => d.exerciseId === exerciseId && d.setNumber === setNumber);
    if (!draft && overrides) {
      // create on the fly
      addDraftSet(exerciseId, {
        reps: overrides.reps,
        weight: overrides.weight,
        weightMode: overrides.weightMode,
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
        weightMode: overrides.weightMode ?? draft.weightMode,
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
    if (completingSetsRef.current.has(key)) return;
    completingSetsRef.current.add(key);
    setSavingKey(key);
    setError(null);
    setOfflineNote(null);

    const reps = draft.reps ? Number(draft.reps) : null;
    const weight = draft.weight ? Number(draft.weight) : null;
    const exerciseForSet = exerciseMap.get(exerciseId);
    const resolvedWeightMode =
      overrides?.weightMode ??
      draft.weightMode ??
      (/гантел|dumbbell/i.test(
        `${exerciseForSet?.name_ru || ""} ${exerciseForSet?.equipment || ""}`,
      )
        ? "per_hand"
        : "total");
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
            weightMode: resolvedWeightMode,
            restTimeSec,
            durationSec: overrides?.durationSec ?? draft.durationSec ?? null,
            note: overrides?.note ?? draft.note ?? null,
            machineParams: overrides?.machineParams ?? draft.machineParams ?? null,
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
          payload: {
            exerciseId,
            setNumber,
            reps,
            weight,
            weightMode: resolvedWeightMode,
            restTimeSec,
            durationSec: overrides?.durationSec ?? draft.durationSec ?? null,
            note: overrides?.note ?? draft.note ?? null,
            machineParams: overrides?.machineParams ?? draft.machineParams ?? null,
            isCompleted: true,
          },
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
              weightMode: resolvedWeightMode,
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
        weight_mode: resolvedWeightMode,
        is_completed: true,
        rest_time_sec: restTimeSec,
        duration_sec: overrides?.durationSec ?? draft.durationSec ?? null,
        note: overrides?.note ?? draft.note ?? null,
        machine_params: overrides?.machineParams ?? draft.machineParams ?? null,
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
      const targetSets = Number(
        plan.exercises.find((item) => item.exercise_id === exerciseId)?.target_sets,
      ) || null;
      const plannedWasComplete = isPlannedExerciseComplete(baseDrafts, exerciseId, targetSets);
      const plannedIsComplete = isPlannedExerciseComplete(nextDrafts, exerciseId, targetSets);
      const shouldStartRest = shouldStartRestAfterSet({
        setWasCompleted: draft.isCompleted,
        restWasActiveAtSubmit,
        restIsActiveNow: useWorkoutStore.getState().isResting,
      });
      if (shouldStartRest) {
        setRestContext({
          exerciseName: exerciseMap.get(exerciseId)?.name_ru || "упражнение",
          nextExerciseName:
            plannedIsComplete && currentExerciseIndex < exerciseIds.length - 1
              ? exerciseMap.get(exerciseIds[currentExerciseIndex + 1])?.name_ru || null
              : null,
          isLastSetOfExercise: plannedIsComplete,
          isLastExercise: currentExerciseIndex >= exerciseIds.length - 1,
        });
        startRest(restTimeSec);
      }
      // Correcting an old set or logging while another rest is running must not change its deadline.
      if (!draft.isCompleted) {
        toast(`Подход ${setNumber} · готово`);
      } else {
        toast(`Подход ${setNumber} обновлён`, "info");
      }

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

      if (
        plannedIsComplete &&
        !plannedWasComplete &&
        currentExerciseIndex < exerciseIds.length - 1
      ) {
        trackEvent("workout_exercise_completed", {
          exercise_id: exerciseId,
          index: currentExerciseIndex + 1,
          total: exerciseIds.length,
        });
        if (autoAdvanceExercises) setAutoAdvanceCountdown((value) => value ?? 3);
      }
    } catch (err) {
      setError(toUserMessage(err, "Не удалось сохранить подход"));
    } finally {
      completingSetsRef.current.delete(key);
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
          <WorkoutElapsedClock
            startedAt={null}
            frozenSec={elapsedFinalSec ?? 0}
            className="mt-1 text-3xl font-semibold tabular-nums"
          />
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
        <div className="rounded-2xl bg-tg-secondary p-4">
          <p className="text-sm font-medium">Сессия не найдена</p>
          <p className="mt-1 text-sm text-tg-hint">
            {error || "Откройте каталог или вернитесь на главную."}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="tap-target-x flex-1 rounded-xl bg-tg-bg px-3 py-2 text-sm"
            >
              На главную
            </button>
            <button
              type="button"
              onClick={() => navigate("/workouts")}
              className="tap-target-x flex-1 rounded-xl bg-tg-button px-3 py-2 text-sm font-semibold text-tg-button-text"
            >
              В каталог
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="pb-24">
      <Header
        title={programDayLabel(activeWorkout.title, Number(plan.day_index) || undefined)}
        subtitle={`Упр. ${Math.min(currentExerciseIndex + 1, exerciseIds.length)}/${exerciseIds.length || 1} · ${weekPhase.label} · запас ${weekPhase.rir} повт. (RIR)`}
      />
      <p className="mb-3 text-xs text-tg-hint">
        Сессия сохраняется автоматически: можно выйти и продолжить позже с главной. RIR — сколько
        повторов осталось бы выполнить до отказа.
      </p>

      <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-tg-secondary px-4 py-3">
        <WorkoutElapsedClock
          startedAt={activeWorkout.started_at}
          frozenSec={elapsedFinalSec}
          paused={activeWorkout.status === "completed"}
          label="Таймер тренировки"
        />
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={toggleSimpleMode}
            className="rounded-full bg-tg-bg px-2.5 py-1.5 text-[11px] font-medium text-tg-hint"
            title={simpleMode ? "Показать все настройки" : "Режим зала"}
          >
            {simpleMode ? "Зал" : "Полный"}
          </button>
          <button
            type="button"
            onClick={openFinishDialog}
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

      {!simpleMode ? (
        <div className="mb-3 rounded-xl bg-tg-secondary px-3 py-2 text-xs text-tg-hint">
          Неделя {weekPhase.weekInCycle}/3 · {weekPhase.label}: цель {weekPhase.defaultReps} повт.,{" "}
          {weekPhase.rir}. Вес: −/+ 1 кг, тонко −/+ 100 г.
          {hasReplacements
            ? " Есть замены — вернуть исходные можно на Главной в блоке «Сегодня»."
            : ""}
        </div>
      ) : null}

      {plan.exercises.length > 1 && activeWorkout?.status !== "completed" ? (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-tg-secondary px-3 py-2">
          <p className="text-[11px] text-tg-hint">
            Хотите другой набор, сохранив структуру дня?
          </p>
          <button
            type="button"
            onClick={prepareBulkReplacement}
            className="shrink-0 rounded-lg bg-tg-bg px-3 py-2 text-xs font-medium text-tg-link"
          >
            Заменить всё
          </button>
        </div>
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
                "tap-target-x shrink-0 rounded-full px-3 py-2 text-xs min-h-[44px]",
                idx === currentExerciseIndex
                  ? "bg-tg-button text-tg-button-text"
                  : done
                    ? "bg-tg-secondary text-tg-hint"
                    : "bg-tg-secondary",
              ].join(" ")}
            >
              {simpleMode ? `${idx + 1}${done ? "✓" : ""}` : `${idx + 1}. ${name}`}
            </button>
          );
        })}
      </div>

      {currentExercise ? (
        <article className="space-y-3 rounded-2xl bg-tg-secondary p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-medium">{currentExercise.name_ru}</h2>
              <p className="mt-0.5 text-xs font-medium text-tg-link">
                {currentExercise.muscle_group
                  ? enumLabel(currentExercise.muscle_group)
                  : "Группа мышц не указана"}
              </p>
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
                onClick={() => void askAiForCurrent("replace")}
              >
                {aiAssistLoading ? "ИИ…" : "ИИ"}
              </button>
              {simpleMode && !moreOpen ? (
                <button
                  type="button"
                  className="text-xs text-tg-hint"
                  onClick={() => setMoreOpen(true)}
                >
                  Ещё
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={aiAssistLoading}
              onClick={() => void askAiForCurrent("replace")}
              className="rounded-full bg-tg-bg px-2.5 py-1 text-[11px] text-tg-link disabled:opacity-50"
            >
              Замена
            </button>
            <button
              type="button"
              disabled={aiAssistLoading}
              onClick={() => void askAiForCurrent("easier")}
              className="rounded-full bg-tg-bg px-2.5 py-1 text-[11px] text-tg-link disabled:opacity-50"
            >
              Легче
            </button>
            <button
              type="button"
              disabled={aiAssistLoading}
              onClick={() => void askAiForCurrent("no_equipment")}
              className="rounded-full bg-tg-bg px-2.5 py-1 text-[11px] text-tg-link disabled:opacity-50"
            >
              Без инвентаря
            </button>
            <button
              type="button"
              disabled={aiAssistLoading}
              onClick={() => void askAiForCurrent("technique")}
              className="rounded-full bg-tg-bg px-2.5 py-1 text-[11px] text-tg-link disabled:opacity-50"
            >
              Техника
            </button>
          </div>

          {simpleMode && !moreOpen ? (
            <div className="relative overflow-hidden rounded-xl">
              <ExerciseMediaPlayer exercise={currentExercise} compact mediaOnly preview />
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className="tap-target-x absolute right-2 top-2 rounded-lg bg-black/65 px-3 py-2 text-xs font-medium text-white"
                aria-label={`Развернуть медиа и технику: ${currentExercise.name_ru}`}
              >
                Медиа и техника
              </button>
            </div>
          ) : null}

          {!simpleMode || moreOpen ? (
            <ExerciseMediaPlayer exercise={currentExercise} compact />
          ) : null}

          {!simpleMode || moreOpen ? (
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
          ) : (
            <p className="text-xs text-tg-hint">
              Отдых {Math.floor(currentRestSec / 60)}:
              {String(currentRestSec % 60).padStart(2, "0")} · после «Готово» таймер сам
            </p>
          )}

          {(!simpleMode || moreOpen) && currentExercise.common_mistakes ? (
            <p className="text-xs text-tg-hint">Частые ошибки: {currentExercise.common_mistakes}</p>
          ) : null}

          <div className="space-y-2">
            {currentSets.map((draft) => {
              const key = `${draft.exerciseId}:${draft.setNumber}`;
              const dur = draft.durationSec;
              const ready = draftReadyToComplete(draft, currentLoadType);
              const isFocus =
                simpleMode &&
                !draft.isCompleted &&
                draft.setNumber ===
                  (currentSets.find((d) => !d.isCompleted)?.setNumber ?? draft.setNumber);
              return (
                <div
                  key={key}
                  className={[
                    "flex items-center justify-between rounded-xl bg-tg-bg px-3 py-2 text-sm",
                    draft.isCompleted ? "opacity-80" : "",
                    isFocus ? "ring-2 ring-tg-button/40" : "",
                  ].join(" ")}
                >
                  <div>
                    <p className="text-xs text-tg-hint">Подход {draft.setNumber}</p>
                    <p className={["font-medium", isFocus ? "text-base" : ""].join(" ")}>
                      {currentLoadType === "weight_reps"
                        ? `${draft.weight || "—"} кг${draft.weightMode === "per_hand" ? " на гантель" : ""} × ${draft.reps || "—"}`
                        : currentLoadType === "reps_only"
                          ? `${draft.reps || "—"} повт.`
                          : formatDurationLabel(Number(dur) || 0)}
                      {draft.note ? ` · ${draft.note}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {draft.isCompleted ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-tg-hint">✓</span>
                        <button
                          type="button"
                          className="tap-target-x min-h-[44px] rounded-lg bg-tg-secondary px-3 py-2 text-xs font-medium"
                          onClick={() => {
                            setEditingSetNumber(draft.setNumber);
                            setAddSetOpen(true);
                          }}
                        >
                          Править
                        </button>
                      </div>
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
                          Править
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
                          className={[
                            "tap-target-x rounded-lg bg-tg-button px-3 font-semibold text-tg-button-text disabled:opacity-50",
                            isFocus ? "min-h-[52px] px-5 text-sm" : "min-h-[44px] py-2 text-xs",
                          ].join(" ")}
                        >
                          {savingKey === key ? "…" : "Готово"}
                        </button>
                      </>
                    )}
                    {!draft.isCompleted && currentSets.length > 1 && (!simpleMode || moreOpen) ? (
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
                    weightMode: done.weightMode,
                    durationSec: done.durationSec,
                    restTimeSec: done.restTimeSec,
                    machineParams: done.machineParams,
                  });
                  void completeSet(open.exerciseId, open.setNumber, {
                    reps: done.reps,
                    weight: done.weight,
                    weightMode: done.weightMode,
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
                    weightMode: done.weightMode,
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
                      weightMode: done.weightMode,
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
            {(!simpleMode || moreOpen) ? (
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
            ) : null}
          </div>
          {simpleMode && !moreOpen ? (
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl bg-tg-bg px-3 py-2.5 text-xs font-medium text-tg-link"
                onClick={() => setMoreOpen(true)}
              >
                Ещё: замена, отдых, медиа
              </button>
              {!isLastExercise ? (
                <button
                  type="button"
                  className="rounded-xl bg-tg-bg px-3 py-2.5 text-xs text-tg-hint"
                  onClick={() => void (async () => {
                    if (!await confirmAction("Пропустить это упражнение и перейти к следующему?")) return;
                    nextExercise();
                    if (activeWorkout) {
                      void persistSession(
                        activeWorkout,
                        drafts,
                        Math.min(exerciseIds.length - 1, currentExerciseIndex + 1),
                      );
                    }
                    toast("Упражнение пропущено", "info");
                  })()}
                >
                  Пропустить
                </button>
              ) : null}
            </div>
          ) : null}
          <p className="text-[11px] text-tg-hint">
            План: {plan.exercises.find((e) => e.exercise_id === currentExercise.id)?.target_sets ?? "—"}{" "}
            подх. × {targetReps}. «Готово» — если поля заполнены; иначе «Править».
          </p>

          {addSetOpen ? (
            <AddSetModal
              key={`set-modal-${currentExercise.id}-${editingSetNumber ?? "new"}`}
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
                    weightMode: vals.weightMode,
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
                    weightMode: vals.weightMode,
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
                  weightMode: vals.weightMode,
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
                    weightMode: vals.weightMode,
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

      <RestTimerHost restContext={restContext} workoutId={activeWorkout.id} />

      {autoAdvanceCountdown != null ? (
        <div className="fixed inset-x-3 bottom-24 z-50 rounded-2xl bg-[#1a1a1e] p-4 text-white shadow-2xl">
          <p className="text-sm font-semibold">Упражнение выполнено</p>
          <p className="mt-1 text-xs text-white/70">
            Переход к следующему через {autoAdvanceCountdown} сек.
          </p>
          <button
            type="button"
            className="mt-3 w-full rounded-xl bg-white/10 px-3 py-2 text-sm font-medium"
            onClick={() => setAutoAdvanceCountdown(null)}
          >
            Отмена — добавить ещё подход
          </button>
        </div>
      ) : null}

      <button
        type="button"
        disabled={completing}
        onClick={openFinishDialog}
        className="mt-4 w-full rounded-xl bg-tg-secondary px-4 py-3 text-sm font-medium disabled:opacity-60"
      >
        Завершить тренировку
      </button>
      <button
        type="button"
        disabled={completing}
        onClick={() => void discardWorkout()}
        className="mt-2 w-full rounded-xl px-4 py-3 text-sm text-red-700 disabled:opacity-60"
      >
        Отменить и удалить тренировку
      </button>

      {finishOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 sm:items-center">
          <div
            ref={finishDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="finish-workout-title"
            tabIndex={-1}
            className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-tg-bg shadow-xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-black/5 px-4 py-3">
              <div>
                <p id="finish-workout-title" className="text-base font-semibold">
                  Завершить тренировку
                </p>
                <WorkoutElapsedClock
                  startedAt={activeWorkout.started_at}
                  frozenSec={elapsedFinalSec}
                  paused={activeWorkout.status === "completed"}
                  className="text-xs tabular-nums text-tg-hint"
                />
              </div>
              <button
                type="button"
                onClick={() => setFinishOpen(false)}
                className="min-h-11 px-2 text-sm text-tg-link"
              >
                Отмена
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {!isLastExercise ? (
                <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800">
                  Выполнено упражнений: {Math.min(currentExerciseIndex + 1, exerciseIds.length)} из{" "}
                  {exerciseIds.length}. Тренировку можно завершить досрочно.
                </p>
              ) : null}
              <div>
                <label className="block text-sm font-medium">Субъективная тяжесть тренировки (RPE), 1–10</label>
                <p className="mt-1 text-xs text-tg-hint">
                  1 — очень легко, 10 — предельная нагрузка. Обычная рабочая тренировка — 6–8.
                </p>
                <div className="mt-3 grid grid-cols-5 gap-2">
                  {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRpe(value)}
                      className={[
                        "min-h-11 rounded-xl text-sm font-semibold",
                        rpe === value
                          ? "bg-tg-button text-tg-button-text"
                          : "bg-tg-secondary text-tg-text",
                      ].join(" ")}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block text-sm font-medium">
                Заметки
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  placeholder="Самочувствие, техника, что изменить в следующий раз…"
                  className="mt-2 w-full resize-none rounded-xl border border-black/10 bg-tg-secondary px-3 py-3 text-sm"
                />
              </label>
            </div>
            <div className="border-t border-black/5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                disabled={completing}
                onClick={() => void finishWorkout()}
                className="w-full rounded-xl bg-tg-button px-4 py-3.5 text-sm font-semibold text-tg-button-text disabled:opacity-60"
              >
                {completing ? "Сохраняем…" : `Завершить · тяжесть ${rpe}/10`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bulkReplacementPlan ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
          <div
            ref={bulkReplaceDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-replace-title"
            tabIndex={-1}
            className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl bg-tg-bg shadow-xl"
          >
            <div className="border-b border-black/5 px-4 py-3">
              <p id="bulk-replace-title" className="text-sm font-semibold">
                Заменить все подходящие упражнения?
              </p>
              <p className="mt-1 text-xs text-tg-hint">
                Структура, подходы, повторы и отдых сохранятся. Рабочий вес будет очищен.
                Исходный набор можно вернуть с главного экрана.
              </p>
            </div>
            <div className="max-h-[58vh] space-y-2 overflow-y-auto p-4">
              {bulkReplacementPlan.replacements.map((item) => (
                <div
                  key={item.fromExercise.id}
                  className="rounded-xl bg-tg-secondary px-3 py-2"
                >
                  <p className="text-xs text-tg-hint">{item.fromExercise.name_ru}</p>
                  <p className="mt-0.5 text-sm font-medium">
                    → {item.toExercise.name_ru}
                  </p>
                  <p className="mt-0.5 text-[10px] text-tg-hint">
                    {enumLabel(item.toExercise.muscle_group)}
                    {item.toExercise.equipment ? ` · ${enumLabel(item.toExercise.equipment)}` : ""}
                  </p>
                </div>
              ))}
              {bulkReplacementPlan.completedSkipped ? (
                <p className="text-xs text-tg-hint">
                  Выполненные упражнения не меняются: {bulkReplacementPlan.completedSkipped}.
                </p>
              ) : null}
              {bulkReplacementPlan.noEquivalentSkipped ? (
                <p className="text-xs text-tg-hint">
                  Оставлены без изменений — нет достаточно близкой замены:{" "}
                  {bulkReplacementPlan.noEquivalentSkipped}.
                </p>
              ) : null}
            </div>
            <div className="flex gap-2 border-t border-black/5 p-4">
              <button
                type="button"
                onClick={() => setBulkReplacementPlan(null)}
                className="flex-1 rounded-xl bg-tg-secondary px-4 py-3 text-sm"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={applyBulkReplacement}
                className="flex-1 rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text"
              >
                Заменить {bulkReplacementPlan.replacements.length}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {replaceOpen && currentExercise ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
          <div
            ref={replaceDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="replace-exercise-title"
            tabIndex={-1}
            className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl bg-tg-bg shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
              <div>
                <p id="replace-exercise-title" className="text-sm font-semibold">Замена упражнения</p>
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
                            {enumLabel(ex.muscle_group)}
                            {ex.equipment ? ` · ${enumLabel(ex.equipment)}` : ""}
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
                          {enumLabel(ex.muscle_group)}
                          {ex.equipment ? ` · ${enumLabel(ex.equipment)}` : ""}
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
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 p-3 sm:items-center">
          <div
            ref={aiAssistDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-assist-title"
            tabIndex={-1}
            className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg touch-pan-y overflow-y-auto overscroll-contain rounded-2xl bg-tg-bg p-4 shadow-xl [overflow-anchor:none]"
          >
            <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-2 flex items-center justify-between gap-2 rounded-t-2xl bg-tg-bg px-4 pb-2 pt-4">
              <p id="ai-assist-title" className="text-sm font-semibold">
                {aiAssistMode === "easier"
                  ? "ИИ · легче"
                  : aiAssistMode === "no_equipment"
                    ? "ИИ · без инвентаря"
                    : aiAssistMode === "technique"
                      ? "ИИ · техника"
                      : "ИИ · замена"}
              </p>
              <button
                type="button"
                className="text-sm text-tg-link"
                onClick={() => setAiAssistOpen(false)}
              >
                Закрыть
              </button>
            </div>
            {currentExercise ? (
              <div className="mb-3 space-y-2">
                <p className="text-xs text-tg-hint">Сейчас: {currentExercise.name_ru}</p>
                <ExerciseMediaPlayer exercise={currentExercise} compact mediaOnly />
              </div>
            ) : null}
            {aiAssistError ? (
              <p className="mb-2 text-sm text-amber-800">{aiAssistError}</p>
            ) : null}
            {aiAssistLoading ? (
              <p className="text-sm text-tg-hint">Думаю…</p>
            ) : aiAssistText ? (
              <p className="whitespace-pre-wrap text-sm">{aiAssistText}</p>
            ) : null}
            {aiSuggestedExercises.length ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-medium text-tg-hint">Из ответа ИИ — нажмите, чтобы заменить</p>
                {aiSuggestedExercises.map((ex) => (
                  <button
                    key={`ai-parsed-${ex.id}`}
                    type="button"
                    onClick={() => {
                      applyReplace(ex);
                      setAiAssistOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-xl bg-tg-button/15 px-3 py-2 text-left text-sm"
                  >
                    <span>{ex.name_ru}</span>
                    <span className="text-xs text-tg-link">Заменить</span>
                  </button>
                ))}
              </div>
            ) : null}
            {recommendedAlternatives.length && aiAssistMode !== "technique" ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-medium text-tg-hint">Быстрый выбор из каталога</p>
                {recommendedAlternatives.slice(0, 8).map((ex) => (
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
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(
                [
                  ["replace", "Замена"],
                  ["easier", "Легче"],
                  ["no_equipment", "Без инвентаря"],
                  ["technique", "Техника"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  disabled={aiAssistLoading}
                  onClick={() => void askAiForCurrent(mode)}
                  className={[
                    "rounded-full px-2.5 py-1 text-[11px]",
                    aiAssistMode === mode
                      ? "bg-tg-button text-tg-button-text"
                      : "bg-tg-secondary text-tg-link",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
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
