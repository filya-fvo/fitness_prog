import { formatDurationLabel } from "@/utils/exerciseLoadType";
import { programTimeSeconds, validProgramNumber, type ProgramTimeUnit } from "../components/programNumbers";
import type { PersonalExerciseDraft } from "./personalProgramDraft";

export function personalRepeatSummary(item: PersonalExerciseDraft, raw: Record<string, string>, unit: ProgramTimeUnit = "seconds"): string {
  const target = item.target;
  if (!target) return item.reps || "—";
  if (target.kind === "timed") {
    const value = raw[`${item.exercise_id}/target/duration_sec`] ?? (unit === "seconds" ? String(target.duration_sec) : "");
    const seconds = programTimeSeconds(value, unit);
    return seconds === null ? "—" : formatDurationLabel(seconds);
  }
  const format = (text: string) => validProgramNumber(text, 1, 100000) ? String(Number(text)) : text;
  const min = format(raw[`${item.exercise_id}/target/reps_min`] ?? String(target.reps_min));
  const max = format(raw[`${item.exercise_id}/target/reps_max`] ?? String(target.reps_max));
  return min === max ? min || "—" : `${min || "—"}–${max || "—"}`;
}
