import { z } from "zod";
import type { PersonalProgramInput } from "@/api/programs";
import { setMethodSchema, workoutGroupSchema } from "@/api/workoutExecutionSchemas";
import { explicitWorkoutTargetSchema } from "@/api/workoutTargetSchemas";
import type { Exercise, WorkoutPlan } from "@/types/workout";
import { inferLoadType } from "@/utils/exerciseLoadType";
import { workoutPreparationError } from "@/utils/workoutMethods";
import { validProgramNumber } from "../components/programNumbers";

/** Includes all seven retained days, methods, groups, targets and owning raw buffers.
 * The maximal canonical fixture (including every numeric buffer) is below two
 * million serialized characters; four million leaves room for unfinished text.
 * Browser storage quotas are separate. Arbitrarily long typing remains in memory
 * with the recovery warning; neither numeric values nor text are truncated.
 */
export const PERSONAL_PROGRAM_DRAFT_MAX_CHARS = 4_000_000;

type InputExercise = PersonalProgramInput["days"][number]["exercises"][number];
export type PersonalExerciseDraft = Omit<InputExercise, "sets" | "rest_sec"> & { sets: string; rest_sec: string };
export type PersonalDayDraft = {
  name: string;
  exercises: PersonalExerciseDraft[];
  groups?: PersonalProgramInput["days"][number]["groups"];
  /** Only uncommitted input text, addressed by owner ID and method/part slot.
   * There is no second copy of the canonical day or reducer here.
   */
  raw?: Record<string, string>;
};
export type PersonalProgramDraft = {
  name: string; location: PersonalProgramInput["location"]; progression: PersonalProgramInput["progression"];
  durationWeeks: string; days: PersonalDayDraft[]; dayCount: number; activeDay: number; step: "setup" | "days";
};
export type DraftResult<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

const text = z.string().max(PERSONAL_PROGRAM_DRAFT_MAX_CHARS);
const methodSchema = setMethodSchema.extend({
  set_number: z.number().int().min(1).max(8),
  parts: z.array(setMethodSchema.shape.parts.element.strict()).min(2).max(8),
}).strict();
const groupSchema = workoutGroupSchema.extend({
  rounds: z.number().int().min(1).max(8), exercise_ids: z.array(z.string().uuid()).min(2).max(12),
}).strict();
const exerciseSchema = z.object({
  exercise_id: z.string().uuid(), sets: text, reps: z.string().max(20), rest_sec: text,
  target: explicitWorkoutTargetSchema.nullable().optional(), set_methods: z.array(methodSchema).max(8).optional(),
  weight_mode: z.enum(["total", "per_hand"]).nullable().optional(),
}).strict();
const daySchema = z.object({
  name: z.string().max(80), exercises: z.array(exerciseSchema).max(12),
  groups: z.array(groupSchema).max(6).optional(), raw: z.record(text).optional(),
}).strict();
const formSchema = z.object({
  name: z.string().max(80), location: z.enum(["gym", "home", "outdoor"]), progression: z.enum(["linear", "phased"]),
  durationWeeks: text, days: z.array(daySchema).min(1).max(7), dayCount: z.number().int().min(1).max(7),
  activeDay: z.number().int().min(0).max(6), step: z.enum(["setup", "days"]),
}).strict();

function rawValues(day: PersonalDayDraft): Map<string, number | null | undefined> {
  const fields = new Map<string, number | null | undefined>();
  for (const row of day.exercises) {
    if (row.target) {
      for (const [key, value] of Object.entries(row.target)) {
        if (key !== "kind") fields.set(`${row.exercise_id}/target/${key}`, value as number | null);
      }
    }
    for (const method of row.set_methods ?? []) method.parts.forEach((part, index) => {
      for (const key of ["target_reps", "target_weight", "pause_after_sec"] as const) {
        fields.set(`${row.exercise_id}/method/${method.set_number}/part/${index + 1}/${key}`, part[key]);
      }
    });
  }
  for (const group of day.groups ?? []) {
    for (const key of ["rounds", "transition_sec", "round_rest_sec"] as const) fields.set(`${group.id}/${key}`, group[key]);
  }
  return fields;
}

/** Shape validation deliberately accepts incomplete numeric text and empty days.
 * Submission validity (topology, required values, catalog) is a separate boundary.
 */
export function parsePersonalProgramDraft(value: unknown): PersonalProgramDraft | null {
  const parsed = formSchema.safeParse(value);
  if (!parsed.success) return null;
  const draft = parsed.data;
  if (draft.days.length < draft.dayCount || draft.activeDay >= draft.dayCount) return null;
  for (const day of draft.days) {
    const owners = rawValues(day);
    if (Object.keys(day.raw ?? {}).some(key => !owners.has(key))) return null;
    if (new Set(day.exercises.map(row => row.exercise_id)).size !== day.exercises.length) return null;
    if (new Set(day.groups?.map(group => group.id)).size !== (day.groups?.length ?? 0)) return null;
  }
  return draft;
}

function schemaErrors(error: z.ZodError, prefix = ""): Record<string, string> {
  return Object.fromEntries(error.issues.map(issue => [`${prefix}${issue.path.join(".")}`, "Проверьте значение"]));
}
function validReps(value: string) { return /^[0-9\-–сs ]{1,20}$/.test(value) && /\d/.test(value); }
function fail<T>(errors: Record<string, string>): DraftResult<T> { return { ok: false, errors }; }
/** Match the server's compatibility field; the owning raw draft stays untouched. */
function compatibilityReps(target: InputExercise["target"], legacy: string): string {
  if (!target) return legacy;
  if (target.kind === "timed") return `${target.duration_sec}с`;
  return target.reps_min === target.reps_max ? String(target.reps_min) : `${target.reps_min}-${target.reps_max}`;
}

/** External-data boundary: shared schemas normalize API Decimal strings exactly once. */
export function personalDayFromPlan(plan: unknown, name: string, previous?: PersonalDayDraft, edited: readonly string[] = []): DraftResult<PersonalDayDraft> {
  const schema = z.object({
    groups: z.array(groupSchema).max(6).optional(),
    exercises: z.array(z.object({
      exercise_id: z.string().uuid(), order: z.number().int().min(1).max(12), target_sets: z.number().int().min(1).max(8),
      target_reps: z.string().max(20).nullable().optional(), rest_sec: z.number().int().min(0).max(300).nullable().optional(),
      target: explicitWorkoutTargetSchema.nullable().optional(), set_methods: z.array(methodSchema).max(8).optional(),
      weight_mode: z.enum(["total", "per_hand"]).nullable().optional(),
    })).min(1).max(12),
  }).safeParse(plan);
  if (!schema.success) return fail(schemaErrors(schema.error));
  const source = schema.data;
  const normalized: WorkoutPlan = { ...source, execution_version: 2 };
  const topology = workoutPreparationError(normalized);
  if (topology) return fail({ exercises: topology });
  const changed = new Set(edited);
  const day: PersonalDayDraft = {
    name,
    ...(source.groups === undefined ? {} : { groups: source.groups }),
    exercises: [...source.exercises].sort((a, b) => a.order - b.order).map(row => {
      const old = previous?.exercises.find(item => item.exercise_id === row.exercise_id);
      function numeric(field: "sets" | "rest_sec", next: number, min: number, max: number): string {
        const raw = old?.[field];
        return raw !== undefined && !changed.has(`${row.exercise_id}/${field}`)
          && (!validProgramNumber(raw, min, max) || Number(raw) === next) ? raw : String(next);
      }
      const targetReps = row.target_reps ?? compatibilityReps(row.target, "");
      return {
        exercise_id: row.exercise_id, sets: numeric("sets", row.target_sets, 1, 8), rest_sec: numeric("rest_sec", row.rest_sec ?? 60, 0, 300),
        // A current or removed typed goal makes target_reps derived compatibility
        // text, not an edit to its owning raw legacy fallback.
        reps: old && !changed.has(`${row.exercise_id}/reps`)
          && (old.target != null || row.target != null || !validReps(old.reps) || old.reps === targetReps) ? old.reps : targetReps,
        ...(row.target === undefined ? {} : { target: row.target }), ...(row.set_methods === undefined ? {} : { set_methods: row.set_methods }),
        ...(row.weight_mode === undefined ? {} : { weight_mode: row.weight_mode }),
      };
    }),
  };
  if (previous?.raw) {
    const owners = rawValues(day);
    const prior = rawValues(previous);
    day.raw = Object.fromEntries(Object.entries(previous.raw).filter(([key]) => owners.has(key) && !changed.has(key) && owners.get(key) === prior.get(key)));
  }
  return { ok: true, value: day };
}

/** Read the owning raw buffer, never a stale committed value when text is pending. */
function buffered(day: PersonalDayDraft, key: string, value: number | null | undefined, optionalWeight = false): unknown {
  const raw = day.raw?.[key];
  if (raw === undefined) return value;
  if (optionalWeight) return raw === "" ? null : raw;
  return /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : raw;
}

export function personalDayToPlan(day: PersonalDayDraft, catalog?: readonly Exercise[]): DraftResult<WorkoutPlan> {
  const shape = daySchema.safeParse(day);
  if (!shape.success) return fail(schemaErrors(shape.error));
  const errors: Record<string, string> = {};
  if (!day.name.trim()) errors.name = "Укажите название дня";
  if (!day.exercises.length) errors.exercises = "Добавьте упражнение";
  const owners = rawValues(day);
  if (Object.keys(day.raw ?? {}).some(key => !owners.has(key))) errors.raw = "Проверьте черновик";
  const numbers = day.exercises.map((row, index) => {
    const setsValid = validProgramNumber(row.sets, 1, 8);
    const restValid = validProgramNumber(row.rest_sec, 0, 300);
    if (!setsValid) errors[`exercises.${index}.sets`] = "Укажите от 1 до 8 подходов";
    if (!restValid) errors[`exercises.${index}.rest_sec`] = "Укажите отдых от 0 до 300 секунд";
    if (!validReps(row.reps)) errors[`exercises.${index}.reps`] = "Укажите повторы";
    return { sets: setsValid ? Number(row.sets) : undefined, rest: restValid ? Number(row.rest_sec) : undefined };
  });
  // Do not even construct a numeric plan from a blank/invalid required field.
  if (Object.keys(errors).length) return fail(errors);
  const exercises: WorkoutPlan["exercises"] = day.exercises.map((row, index) => {
    const prefix = `exercises.${index}.`;
    let target = row.target;
    if (target) {
      const input = Object.fromEntries(Object.entries(target).map(([key, value]) => [key, key === "kind" ? value
        : buffered(day, `${row.exercise_id}/target/${key}`, value as number | null, key === "target_weight")]));
      const parsed = explicitWorkoutTargetSchema.safeParse(input);
      if (parsed.success) target = parsed.data;
      else Object.assign(errors, schemaErrors(parsed.error, `${prefix}target.`));
    }
    const methods = row.set_methods?.map((method, methodIndex) => {
      const parsed = methodSchema.safeParse({ ...method, parts: method.parts.map((part, partIndex) => {
        const base = `${row.exercise_id}/method/${method.set_number}/part/${partIndex + 1}/`;
        return { ...part, target_reps: buffered(day, `${base}target_reps`, part.target_reps),
          pause_after_sec: buffered(day, `${base}pause_after_sec`, part.pause_after_sec),
          ...(part.target_weight !== undefined || day.raw?.[`${base}target_weight`] !== undefined
            ? { target_weight: buffered(day, `${base}target_weight`, part.target_weight, true) } : {}) };
      }) });
      if (!parsed.success) Object.assign(errors, schemaErrors(parsed.error, `${prefix}set_methods.${methodIndex}.`));
      return parsed.success ? parsed.data : method;
    });
    if (catalog) {
      const exercise = catalog.find(item => item.id === row.exercise_id);
      const load = exercise ? inferLoadType(exercise) : null;
      if (!exercise) errors[`${prefix}exercise_id`] = "Упражнение недоступно в каталоге";
      if (target && target.kind !== (load === "cardio_machine" ? "timed" : load)) errors[`${prefix}target`] = "Цель не соответствует типу нагрузки";
      if (methods?.length && load !== "weight_reps") errors[`${prefix}set_methods`] = "Методы требуют вес и повторы";
    }
    return { exercise_id: row.exercise_id, order: index + 1, target_sets: numbers[index].sets!, target_reps: compatibilityReps(target, row.reps), rest_sec: numbers[index].rest!,
      ...(target === undefined ? {} : { target }), ...(methods === undefined ? {} : { set_methods: methods }),
      ...(row.weight_mode === undefined ? {} : { weight_mode: row.weight_mode }) };
  });
  const groups = day.groups?.map((group, index) => {
    const parsed = groupSchema.safeParse({ ...group,
      rounds: buffered(day, `${group.id}/rounds`, group.rounds), transition_sec: buffered(day, `${group.id}/transition_sec`, group.transition_sec),
      round_rest_sec: buffered(day, `${group.id}/round_rest_sec`, group.round_rest_sec) });
    if (!parsed.success) Object.assign(errors, schemaErrors(parsed.error, `groups.${index}.`));
    return parsed.success ? parsed.data : group;
  });
  if (Object.keys(errors).length) return fail(errors);
  const value: WorkoutPlan = { execution_version: 2, ...(groups === undefined ? {} : { groups }), exercises };
  const topology = workoutPreparationError(value);
  return topology ? fail({ exercises: topology }) : { ok: true, value };
}

/** One complete request for the existing atomic createMyProgram endpoint. */
export function personalProgramInput(draft: PersonalProgramDraft, catalog: readonly Exercise[]): DraftResult<PersonalProgramInput> {
  const parsed = parsePersonalProgramDraft(draft);
  if (!parsed) return fail({ draft: "Проверьте черновик программы" });
  const errors: Record<string, string> = {};
  if (draft.name.trim().length < 3) errors.name = "Название должно содержать от 3 до 80 символов";
  if (!validProgramNumber(draft.durationWeeks, 1, 52)) errors.durationWeeks = "Укажите от 1 до 52 недель";
  const days: PersonalProgramInput["days"] = [];
  for (const [index, day] of draft.days.slice(0, draft.dayCount).entries()) {
    const converted = personalDayToPlan(day, catalog);
    if (!converted.ok) {
      Object.assign(errors, Object.fromEntries(Object.entries(converted.errors).map(([key, message]) => [`days.${index}.${key}`, message])));
      continue;
    }
    days.push({ name: day.name.trim(), ...(converted.value.groups === undefined ? {} : { groups: converted.value.groups }),
      exercises: converted.value.exercises.map(row => ({ exercise_id: row.exercise_id, sets: row.target_sets, reps: row.target_reps!, rest_sec: row.rest_sec!,
        ...(row.target === undefined ? {} : { target: row.target }), ...(row.set_methods === undefined ? {} : { set_methods: row.set_methods }),
        ...(row.weight_mode === undefined ? {} : { weight_mode: row.weight_mode }) })) });
  }
  return Object.keys(errors).length ? fail(errors) : { ok: true, value: { name: draft.name.trim(), location: draft.location,
    progression: draft.progression, duration_weeks: Number(draft.durationWeeks), days } };
}
