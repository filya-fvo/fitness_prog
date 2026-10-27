import { setMethodSchema } from "@/api/workoutExecutionSchemas";
import { explicitWorkoutTargetSchema } from "@/api/workoutTargetSchemas";

export function validProgramNumber(value: string, min: number, max: number) {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
}

export function validProgramWeight(value: string) {
  return value === "" || (/^\d+(?:[.,]\d+)?$/.test(value) && (value.split(/[.,]/)[1] ?? "").replace(/0+$/, "").length <= 2 && Number(value.replace(",", ".")) > 0 && Number(value.replace(",", ".")) <= 10000);
}

export type ProgramTimeUnit = "seconds" | "minutes";
/** Exact integer arithmetic: incomplete decimals and fractional seconds never round. */
export function programTimeSeconds(value: string, unit: ProgramTimeUnit): number | null {
  if (unit === "seconds") return validProgramNumber(value, 1, 86400) ? Number(value) : null;
  if (!/^\d+(?:[.,]\d+)?$/.test(value)) return null;
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  const digits = fraction.replace(/0+$/, "");
  if (digits.length > 2 || Number(whole) > 1440) return null;
  const scale = 10 ** digits.length;
  const numerator = (Number(whole) * scale + Number(digits)) * 60;
  return numerator % scale === 0 && numerator / scale >= 1 && numerator / scale <= 86400 ? numerator / scale : null;
}

export function changeProgramTimeUnit(value: string, from: ProgramTimeUnit, to: ProgramTimeUnit): string | null {
  const seconds = programTimeSeconds(value, from);
  if (seconds === null || from === to) return value;
  // Seconds divisible by three have a finite decimal representation in minutes.
  return to === "seconds" ? String(seconds) : seconds % 3 === 0 ? String(seconds / 60) : null;
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
