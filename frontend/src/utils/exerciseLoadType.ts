/**
 * Classify exercises for set-input UI: weight+reps vs timed hold vs cardio machine.
 */

import type { Exercise } from "@/types/workout";

export type ExerciseLoadType = "weight_reps" | "reps_only" | "timed" | "cardio_machine";

export type CardioMachineKind = "treadmill" | "elliptical" | "bike" | "rower" | "other";

// NOTE: do NOT match bare "наклон" — it hits "тяга … в наклоне" (weight+reps).
const TIMED_NAME_RE =
  /планка|удержание|лодочк|hollow|dead bug|мертвый жук|bird dog|птица-собака|растяж|мобил|поза |наклоны к|кошка-?корова|вращения таза|раскрытие груд|голеностоп/i;

const CARDIO_MACHINE_RE = /беговая|дорожк|эллипс|велотренаж|гребл|row|elliptical|treadmill|bike/i;

const CARDIO_BODY_RE =
  /бёрпи|берпи|альпинист|скакал|звезд|скейтер|бег на месте|высокие колени|jumping jack|burpee|mountain climber/i;

const REPS_ONLY_RE = /подтягиван|отжиман|брусь|австралийск|diamond push|pull-up|push-up/i;

export function inferLoadType(exercise: Pick<Exercise, "name_ru" | "muscle_group" | "equipment" | "tags">): ExerciseLoadType {
  const name = (exercise.name_ru || "").toLowerCase();
  const muscle = (exercise.muscle_group || "").toLowerCase();
  const equip = (exercise.equipment || "").toLowerCase();
  const tags = (exercise.tags || []).map((t) => t.toLowerCase());

  if (tags.includes("cardio_machine") || tags.includes("load:cardio_machine")) {
    return "cardio_machine";
  }
  if (tags.includes("timed") || tags.includes("load:timed")) {
    return "timed";
  }
  if (tags.includes("reps_only") || tags.includes("load:reps_only")) {
    return "reps_only";
  }
  if (tags.includes("weight_reps") || tags.includes("load:weight_reps")) {
    return "weight_reps";
  }

  if (CARDIO_MACHINE_RE.test(name) || CARDIO_MACHINE_RE.test(equip)) {
    return "cardio_machine";
  }
  if (muscle === "кардио" && (CARDIO_BODY_RE.test(name) || /свой вес|body/.test(equip))) {
    // bodyweight cardio often logged as time
    if (CARDIO_BODY_RE.test(name)) return "timed";
  }
  if (TIMED_NAME_RE.test(name)) return "timed";
  if (CARDIO_BODY_RE.test(name)) return "timed";
  if (REPS_ONLY_RE.test(name) && !/гантел|штан|блок|тренаж|cable|barbell|dumbbell/.test(name + equip)) {
    return "reps_only";
  }
  return "weight_reps";
}

export function inferCardioMachineKind(
  exercise: Pick<Exercise, "name_ru" | "equipment">,
): CardioMachineKind {
  const blob = `${exercise.name_ru || ""} ${exercise.equipment || ""}`.toLowerCase();
  if (/бегов|дорож|treadmill|run/.test(blob) && !/на месте/.test(blob)) return "treadmill";
  if (/эллипс|elliptical|cross trainer/.test(blob)) return "elliptical";
  if (/вело|bike|cycle/.test(blob) && !/велосипед/.test(blob)) return "bike";
  // "Велосипед" crunch is not a machine
  if (/гребл|row/.test(blob)) return "rower";
  if (/велотренаж/.test(blob)) return "bike";
  return "other";
}

export function defaultTimedSeconds(exercise: Pick<Exercise, "name_ru" | "muscle_group">): number {
  const name = (exercise.name_ru || "").toLowerCase();
  if (/планка|удержание|лодоч/.test(name)) return 45;
  if (/бёрпи|берпи|альпинист|скакал|звезд|скейтер|бег на месте|высокие колени/.test(name)) {
    return 60;
  }
  if ((exercise.muscle_group || "").toLowerCase() === "кардио") return 300;
  return 45;
}

export function formatDurationLabel(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r} с`;
  if (r === 0) return `${m} мин`;
  return `${m}:${String(r).padStart(2, "0")}`;
}
