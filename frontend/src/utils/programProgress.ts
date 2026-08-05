/**
 * Active program cursor: next day + manual week phase (light→medium→heavy loop).
 * Stored in user.goals JSON.
 */

import type { Program } from "@/types/workout";
import { programDays } from "@/utils/programRecommend";
import {
  WEEK_PHASES,
  type WeekPhase,
  type WeekPhaseMeta,
  resolveWeekPhase,
} from "@/utils/loadProgression";

export type ProgramCursor = {
  programId: string;
  nextDayIndex: number;
  weekPhase: WeekPhase;
  phaseSource: "auto" | "manual";
  /** How many workouts completed in current phase (for split-cycle advance). */
  workoutsInPhase: number;
};

export function phaseMetaFromName(phase: WeekPhase, cycleIndex = 0): WeekPhaseMeta {
  const base = WEEK_PHASES[phase];
  const weekInCycle = (phase === "light" ? 1 : phase === "medium" ? 2 : 3) as 1 | 2 | 3;
  return {
    phase,
    weekInCycle,
    cycleIndex,
    ...base,
  };
}

export function nextPhase(phase: WeekPhase): WeekPhase {
  if (phase === "light") return "medium";
  if (phase === "medium") return "heavy";
  return "light";
}

export function readProgramCursor(
  goals: Record<string, unknown>,
  program: Program,
  startedAt?: string | null,
): ProgramCursor {
  const programId = program.id;
  const days = Math.max(1, programDays(program));
  const activeId = String(goals.active_program_id || "");
  const rawDay = Number(goals.active_program_next_day);
  const rawPhase = String(goals.active_program_week_phase || "").toLowerCase();
  const rawSource = String(goals.active_program_phase_source || "auto").toLowerCase();
  const workoutsInPhase = Math.max(0, Number(goals.active_program_workouts_in_phase) || 0);

  const auto = resolveWeekPhase(
    activeId === programId ? String(goals.active_program_started_at || startedAt || "") : null,
  );

  let weekPhase: WeekPhase = auto.phase;
  if (rawPhase === "light" || rawPhase === "medium" || rawPhase === "heavy") {
    weekPhase = rawPhase;
  }
  const phaseSource: "auto" | "manual" = rawSource === "manual" ? "manual" : "auto";
  if (phaseSource === "auto") {
    weekPhase = auto.phase;
  }

  let nextDayIndex = Number.isFinite(rawDay) && rawDay >= 1 ? Math.floor(rawDay) : 0;
  if (activeId !== programId || nextDayIndex < 1) {
    // fallback: weekday-based suggestion only when no cursor
    nextDayIndex = 0;
  }
  if (nextDayIndex < 1 || nextDayIndex > days) {
    nextDayIndex = ((new Date().getDay() + 6) % days) + 1;
  }

  return {
    programId,
    nextDayIndex,
    weekPhase,
    phaseSource,
    workoutsInPhase: activeId === programId ? workoutsInPhase : 0,
  };
}

export function cursorGoalsPatch(
  programId: string,
  cursor: Omit<ProgramCursor, "programId"> & { startedAt?: string },
  todayISO: string,
): Record<string, unknown> {
  return {
    active_program_id: programId,
    active_program_started_at: cursor.startedAt || todayISO,
    active_program_next_day: cursor.nextDayIndex,
    active_program_week_phase: cursor.weekPhase,
    active_program_phase_source: cursor.phaseSource,
    active_program_workouts_in_phase: cursor.workoutsInPhase,
  };
}

/** After finishing a program day: advance day; after full split, light→medium→heavy→… */
export function advanceCursorAfterWorkout(
  program: Program,
  cursor: ProgramCursor,
  completedDayIndex: number,
  completedPhase: WeekPhase,
): ProgramCursor {
  const days = Math.max(1, programDays(program));
  const nextDay = (Math.max(1, completedDayIndex) % days) + 1;
  let phase = completedPhase;
  let source = cursor.phaseSource;
  let workoutsInPhase = cursor.workoutsInPhase + 1;

  // Full split cycle completed when we wrap to day 1 after last day
  const wrapped = nextDay === 1 && completedDayIndex === days;
  if (wrapped) {
    phase = nextPhase(completedPhase);
    source = "manual"; // keep cycling L-M-H explicitly
    workoutsInPhase = 0;
  }

  return {
    programId: program.id,
    nextDayIndex: nextDay,
    weekPhase: phase,
    phaseSource: source,
    workoutsInPhase,
  };
}

export function listProgramDays(program: Program): Array<{ dayIndex: number; title: string }> {
  const structure = (program.structure || {}) as Record<string, unknown>;
  const schedule = (structure.schedule as unknown[]) || (structure.days as unknown[]) || [];
  const days = Math.max(1, programDays(program));
  const out: Array<{ dayIndex: number; title: string }> = [];
  for (let i = 1; i <= days; i += 1) {
    const raw = Array.isArray(schedule) ? schedule[i - 1] : null;
    let title = `День ${i}`;
    if (raw && typeof raw === "object") {
      const d = raw as Record<string, unknown>;
      title = String(d.name || d.title || d.workout_type || title);
    }
    out.push({ dayIndex: i, title });
  }
  return out;
}
