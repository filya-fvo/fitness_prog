import type { Program, Workout, WorkoutPlan } from "@/types/workout";
import { advanceCursorAfterWorkout, readProgramCursor } from "@/utils/programProgress";
import type { WeekPhase } from "@/utils/loadProgression";
const phases: WeekPhase[] = ["light", "medium", "heavy"];

/** Display-only projection. Server completion remains authoritative after sync. */
export function overlayOfflineProgramProgress(goals: Record<string, unknown>, program: Program, workouts: Workout[], preparedAt: string, day: string, owner: string): Record<string, unknown> {
  const updated = { ...goals };
  const completed = workouts.filter(workout => workout.user_id === owner && workout.program_id === program.id && workout.status === "completed" && workout.scheduled_date <= day && Date.parse(workout.completed_at || "") > Date.parse(preparedAt))
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || String(a.completed_at).localeCompare(String(b.completed_at)) || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  for (const workout of completed) {
    if (seen.has(workout.id)) continue;
    seen.add(workout.id);
    const plan = workout.plan as WorkoutPlan;
    const index = Number(plan.day_index);
    const cursor = readProgramCursor(updated, program);
    if (cursor.nextDayIndex !== index) continue;
    const effective = String(plan.week_phase);
    const base = String(plan.base_week_phase || effective) as WeekPhase;
    if (!phases.includes(base)) continue;
    if (phases.indexOf(effective as WeekPhase) >= 0 && phases.indexOf(effective as WeekPhase) < phases.indexOf(base)) updated.active_program_repeat_phase = base;
    const next = advanceCursorAfterWorkout(program, cursor, index, base);
    const wrapped = next.nextDayIndex === 1;
    if (wrapped && updated.active_program_repeat_phase === base) next.weekPhase = base;
    if (wrapped) {
      delete updated.active_program_repeat_phase;
      const recovery = updated.workout_illness_recovery;
      if (recovery && typeof recovery === "object" && (recovery as Record<string, unknown>).light_cycle_active === true) updated.workout_illness_recovery = { choice_pending: false, light_cycle_active: false };
    }
    Object.assign(updated, { active_program_next_day: next.nextDayIndex, active_program_week_phase: next.weekPhase, active_program_phase_source: next.phaseSource, active_program_workouts_in_phase: wrapped ? 0 : index });
  }
  return updated;
}
