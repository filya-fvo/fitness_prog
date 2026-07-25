/**
 * 3-week load cycle + weight/reps suggestions from history.
 *
 * Light  — RIR 3–4, more reps, ~90% base weight
 * Medium — RIR 1–2, mid reps, 100% base
 * Heavy  — to failure, 6–8 reps, ~105% base (+ progression)
 */

import type { LocalSetDraft, Workout, WorkoutPlan, WorkoutPlanExercise } from "@/types/workout";

export type WeekPhase = "light" | "medium" | "heavy";

export type WeekPhaseMeta = {
  phase: WeekPhase;
  weekInCycle: 1 | 2 | 3; // 1-based within 3-week block
  cycleIndex: number; // 0-based mesocycle number
  label: string;
  rir: string;
  defaultReps: string;
  /** multiply last base weight */
  weightFactor: number;
  /** absolute bump after a completed heavy week when starting new cycle */
  progressionKg: number;
};

export const WEEK_PHASES: Record<WeekPhase, Omit<WeekPhaseMeta, "phase" | "weekInCycle" | "cycleIndex">> = {
  light: {
    label: "Лёгкая",
    rir: "3–4 до отказа",
    defaultReps: "10-15",
    weightFactor: 0.9,
    progressionKg: 0,
  },
  medium: {
    label: "Средняя",
    rir: "1–2 до отказа",
    defaultReps: "8-12",
    weightFactor: 1.0,
    progressionKg: 0,
  },
  heavy: {
    label: "Тяжёлая",
    rir: "в отказ",
    defaultReps: "6-8",
    weightFactor: 1.05,
    progressionKg: 0,
  },
};

export function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Whole weeks since start date (local calendar). */
export function weeksSince(startISO: string, today = new Date()): number {
  const start = new Date(`${startISO.slice(0, 10)}T12:00:00`);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);
  const diffMs = end.getTime() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 0;
  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
}

export function resolveWeekPhase(startISO: string | null | undefined, today = new Date()): WeekPhaseMeta {
  const start = (startISO || localDateKey(today)).slice(0, 10);
  const w = weeksSince(start, today);
  const weekInCycle = ((w % 3) + 1) as 1 | 2 | 3;
  const cycleIndex = Math.floor(w / 3);
  const phase: WeekPhase = weekInCycle === 1 ? "light" : weekInCycle === 2 ? "medium" : "heavy";
  const base = WEEK_PHASES[phase];
  return {
    phase,
    weekInCycle,
    cycleIndex,
    ...base,
  };
}

/** Round to 0.1 kg (100 g). */
export function roundWeightKg(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 10) / 10;
}

export function formatWeight(value: number): string {
  const r = roundWeightKg(value);
  if (r <= 0) return "";
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function parseWeight(raw: string): number {
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function stepWeight(current: string, deltaKg: number): string {
  const next = Math.max(0, roundWeightKg(parseWeight(current) + deltaKg));
  return formatWeight(next);
}

export function stepReps(current: string, delta: number): string {
  const n = Math.max(0, (Number(current) || 0) + delta);
  return String(n);
}

export type ExerciseHistoryBest = {
  exerciseId: string;
  /** best working weight from last session that had completed sets */
  lastWeight: number;
  lastReps: number;
  lastDate: string | null;
};

/** Per exercise: last completed session's top set (max weight, then max reps). */
export function buildExerciseHistory(workouts: Workout[]): Map<string, ExerciseHistoryBest> {
  const map = new Map<string, ExerciseHistoryBest>();
  const completed = workouts
    .filter((w) => w.status === "completed" || w.sets.some((s) => s.is_completed))
    .slice()
    .sort((a, b) => {
      const da = a.completed_at || a.scheduled_date || "";
      const db = b.completed_at || b.scheduled_date || "";
      return db.localeCompare(da);
    });

  for (const w of completed) {
    const byEx = new Map<string, { weight: number; reps: number }>();
    for (const s of w.sets) {
      if (!s.is_completed) continue;
      const weight = Number(s.weight) || 0;
      const reps = Number(s.reps) || 0;
      if (weight <= 0 && reps <= 0) continue;
      const prev = byEx.get(s.exercise_id);
      if (!prev || weight > prev.weight || (weight === prev.weight && reps > prev.reps)) {
        byEx.set(s.exercise_id, { weight, reps });
      }
    }
    const date = (w.completed_at || w.scheduled_date || "").slice(0, 10) || null;
    for (const [exerciseId, best] of byEx) {
      if (map.has(exerciseId)) continue; // already have newer session
      map.set(exerciseId, {
        exerciseId,
        lastWeight: best.weight,
        lastReps: best.reps,
        lastDate: date,
      });
    }
  }
  return map;
}

export function suggestLoad(input: {
  history?: ExerciseHistoryBest | null;
  phase: WeekPhaseMeta;
}): { weight: string; reps: string; note: string | null } {
  const hist = input.history;
  const phase = input.phase;
  const defaultReps = phase.defaultReps;
  // pick mid of range for default display
  const repsMid = (() => {
    const m = defaultReps.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (m) return String(Math.round((Number(m[1]) + Number(m[2])) / 2));
    const single = defaultReps.match(/(\d+)/);
    return single ? single[1] : "10";
  })();

  if (!hist || hist.lastWeight <= 0) {
    return {
      weight: "",
      reps: repsMid,
      note: null,
    };
  }

  // After each full 3-week cycle, nudge base up a bit from last heavy performance
  const cycleBump = hist.lastWeight > 0 ? phase.cycleIndex * 2.5 : 0;
  let suggested = hist.lastWeight * phase.weightFactor + cycleBump;
  // Heavy week: prefer at least +1 kg over last if last was medium/light-ish
  if (phase.phase === "heavy") {
    suggested = Math.max(suggested, hist.lastWeight + 1);
  }
  if (phase.phase === "light") {
    suggested = Math.min(suggested, hist.lastWeight);
  }
  suggested = roundWeightKg(suggested);

  return {
    weight: formatWeight(suggested),
    reps: repsMid,
    note: `Предложение: ${formatWeight(suggested)} кг × ${repsMid} (${phase.label.toLowerCase()} нед., было ${formatWeight(hist.lastWeight)} кг)`,
  };
}

export function applyPhaseToPlan(
  plan: WorkoutPlan | Record<string, unknown> | null | undefined,
  phase: WeekPhaseMeta,
): WorkoutPlan {
  const raw = (plan && typeof plan === "object" ? plan : {}) as WorkoutPlan;
  const exercises = Array.isArray(raw.exercises) ? raw.exercises : [];
  return {
    ...raw,
    title: raw.title ?? null,
    workout_type: raw.workout_type ?? null,
    day_index: raw.day_index ?? null,
    week_phase: phase.phase,
    week_in_cycle: phase.weekInCycle,
    week_label: phase.label,
    week_rir: phase.rir,
    exercises: exercises.map((ex) => ({
      ...ex,
      target_reps: phase.defaultReps,
    })),
  };
}

export function draftsWithSuggestions(input: {
  exercises: WorkoutPlanExercise[];
  history: Map<string, ExerciseHistoryBest>;
  phase: WeekPhaseMeta;
}): LocalSetDraft[] {
  const drafts: LocalSetDraft[] = [];
  for (const item of [...input.exercises].sort((a, b) => a.order - b.order)) {
    const sets = item.target_sets || 3;
    const sug = suggestLoad({
      history: input.history.get(item.exercise_id),
      phase: input.phase,
    });
    for (let n = 1; n <= sets; n += 1) {
      drafts.push({
        exerciseId: item.exercise_id,
        setNumber: n,
        reps: sug.reps,
        weight: sug.weight,
        isCompleted: false,
        restTimeSec: item.rest_sec ?? 60,
      });
    }
  }
  return drafts;
}

export function ensureProgramStartDate(
  goals: Record<string, unknown>,
  programId: string,
  today = localDateKey(),
): { start: string; goalsPatch: Record<string, unknown> | null } {
  const activeId = String(goals.active_program_id || "");
  const existing = String(goals.active_program_started_at || "").slice(0, 10);
  if (activeId === programId && existing) {
    return { start: existing, goalsPatch: null };
  }
  return {
    start: today,
    goalsPatch: {
      active_program_id: programId,
      active_program_started_at: today,
    },
  };
}
