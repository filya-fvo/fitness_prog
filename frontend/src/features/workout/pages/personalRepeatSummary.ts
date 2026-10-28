import { validProgramNumber } from "../components/programNumbers";
import type { PersonalExerciseDraft } from "./personalProgramDraft";

export function personalRepeatSummary(item: PersonalExerciseDraft, raw: Record<string, string>): string {
  const target = item.target;
  if (!target || target.kind === "timed") return item.reps || "—";
  const format = (text: string) => validProgramNumber(text, 1, 100000) ? String(Number(text)) : text;
  const min = format(raw[`${item.exercise_id}/target/reps_min`] ?? String(target.reps_min));
  const max = format(raw[`${item.exercise_id}/target/reps_max`] ?? String(target.reps_max));
  return min === max ? min || "—" : `${min || "—"}–${max || "—"}`;
}
