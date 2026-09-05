import type { AdminProgramPayload } from "@/api/adminPrograms";
import type { Program } from "@/types/workout";

export type ProgramExerciseDraft = {
  key: string;
  exerciseId: string | null;
  exerciseName: string;
  sets: number;
  reps: string;
  restSec: number;
  weightMode: "total" | "per_hand" | null;
  note: string;
  source: Record<string, unknown>;
};

export type ProgramDayDraft = {
  key: string;
  name: string;
  focus: string;
  exercises: ProgramExerciseDraft[];
  source: Record<string, unknown>;
};

export type ProgramDraft = {
  name: string;
  description: string;
  workoutType: string;
  level: string;
  durationWeeks: number;
  sex: string[];
  location: string;
  equipment: string[];
  limitations: string[];
  days: ProgramDayDraft[];
  sourceStructure: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asTextArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function exerciseFromSource(
  value: unknown,
  programId: string,
  dayIndex: number,
  exerciseIndex: number,
): ProgramExerciseDraft {
  const source = asRecord(value);
  const rawWeightMode = asText(source.weight_mode);
  const weightMode = ["total", "per_hand"].includes(rawWeightMode)
    ? rawWeightMode as Exclude<ProgramExerciseDraft["weightMode"], null>
    : null;
  return {
    key: `${programId}:${dayIndex}:${exerciseIndex}`,
    exerciseId: asText(source.exercise_id) || null,
    exerciseName: asText(source.exercise_name, asText(source.name_ru)),
    sets: asNumber(source.sets ?? source.target_sets, 3),
    reps: asText(source.reps ?? source.target_reps, "8-12"),
    restSec: asNumber(source.rest_sec, 60),
    weightMode,
    note: asText(source.note),
    source,
  };
}

export function draftFromProgram(program: Program): ProgramDraft {
  const structure = asRecord(program.structure);
  const rawSchedule = Array.isArray(structure.schedule)
    ? structure.schedule
    : Array.isArray(structure.days) ? structure.days : [];
  const days = rawSchedule.map((value, dayIndex) => {
    const source = asRecord(value);
    const rawExercises = Array.isArray(source.exercises) ? source.exercises : [];
    return {
      key: `${program.id}:${dayIndex}`,
      name: asText(source.name, asText(source.title, `День ${dayIndex + 1}`)),
      focus: asText(source.focus),
      exercises: rawExercises.map((exercise, exerciseIndex) => (
        exerciseFromSource(exercise, program.id, dayIndex, exerciseIndex)
      )),
      source,
    };
  });
  return {
    name: program.name,
    description: program.description ?? "",
    workoutType: program.workout_type || asText(structure.workout_type, "custom"),
    level: program.level || program.target_level || asText(structure.level, "beginner"),
    durationWeeks: program.duration_weeks ?? 4,
    sex: asTextArray(structure.sex).length ? asTextArray(structure.sex) : ["any"],
    location: asText(structure.location, "gym"),
    equipment: asTextArray(structure.equipment),
    limitations: asTextArray(structure.limitations),
    days,
    sourceStructure: structure,
  };
}

export function emptyProgramPayload(name: string, workoutType: string, level: string): AdminProgramPayload {
  return payloadFromProgramDraft({
    name,
    description: "",
    workoutType,
    level,
    durationWeeks: 4,
    sex: ["any"],
    location: "gym",
    equipment: [],
    limitations: [],
    days: [],
    sourceStructure: {},
  });
}

export function payloadFromProgramDraft(draft: ProgramDraft): AdminProgramPayload {
  const schedule = draft.days.map((day, dayIndex) => ({
    ...day.source,
    day_index: dayIndex + 1,
    name: day.name.trim() || `День ${dayIndex + 1}`,
    focus: day.focus.trim() || undefined,
    exercises: day.exercises.map((exercise, exerciseIndex) => ({
      ...exercise.source,
      exercise_id: exercise.exerciseId || undefined,
      exercise_name: exercise.exerciseId ? undefined : exercise.exerciseName.trim(),
      order: exerciseIndex + 1,
      sets: exercise.sets,
      reps: exercise.reps.trim(),
      rest_sec: exercise.restSec,
      weight_mode: exercise.weightMode || undefined,
      note: exercise.note.trim() || undefined,
    })),
  }));
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    workout_type: draft.workoutType,
    target_level: draft.level,
    level: draft.level,
    duration_weeks: draft.durationWeeks,
    is_template: true,
    structure: {
      ...draft.sourceStructure,
      workout_type: draft.workoutType,
      level: draft.level,
      sex: draft.sex,
      location: draft.location,
      equipment: draft.equipment,
      limitations: draft.limitations,
      days_per_week: schedule.length,
      schedule,
    },
  };
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function copyProgramDay(day: ProgramDayDraft, key: string): ProgramDayDraft {
  return {
    ...day,
    key,
    name: `${day.name} — копия`,
    source: { ...day.source },
    exercises: day.exercises.map((exercise, index) => ({
      ...exercise,
      key: `${key}:${index}`,
      source: { ...exercise.source },
    })),
  };
}
