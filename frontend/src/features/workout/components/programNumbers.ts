import { setMethodSchema } from "@/api/workoutExecutionSchemas";
import { explicitWorkoutTargetSchema } from "@/api/workoutTargetSchemas";

export function validProgramNumber(value: string, min: number, max: number) {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
}

export function validProgramWeight(value: string) {
  return value === "" || (/^\d+(?:[.,]\d+)?$/.test(value) && Number(value.replace(",", ".")) > 0 && Number(value.replace(",", ".")) <= 10000);
}

/** Earlier personal-program drafts stored numbers; preserve the shared recovery lifecycle. */
export function migrateProgramNumbers(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const draft = value as Record<string, unknown>;
  return { ...draft, durationWeeks: typeof draft.durationWeeks === "number" ? String(draft.durationWeeks) : draft.durationWeeks,
    days: Array.isArray(draft.days) ? draft.days.map((day: unknown) => {
      if (!day || typeof day !== "object") return day;
      const entry = day as Record<string, unknown>;
      return { ...entry, exercises: Array.isArray(entry.exercises) ? entry.exercises.map((exercise: unknown) => {
        if (!exercise || typeof exercise !== "object") return exercise;
        const item = exercise as Record<string, unknown>;
        const target = explicitWorkoutTargetSchema.safeParse(item.target);
        const methods = Array.isArray(item.set_methods) ? item.set_methods.map(method => {
          const parsed = setMethodSchema.safeParse(method);
          return parsed.success ? parsed.data : method;
        }) : item.set_methods;
        return { ...item, ...(target.success ? { target: target.data } : {}),
          ...(methods !== undefined ? { set_methods: methods } : {}), sets: typeof item.sets === "number" ? String(item.sets) : item.sets,
          rest_sec: typeof item.rest_sec === "number" ? String(item.rest_sec) : item.rest_sec };
      }) : entry.exercises };
    }) : draft.days };
}
