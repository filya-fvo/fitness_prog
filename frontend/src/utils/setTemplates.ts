export type SetTemplate = {
  id: string;
  label: string;
  sets: number;
  reps: string;
  restSec: number;
};

export const SET_TEMPLATES: SetTemplate[] = [
  { id: "hypertrophy", label: "3×8–12", sets: 3, reps: "8-12", restSec: 75 },
  { id: "strength", label: "5×5", sets: 5, reps: "5", restSec: 150 },
  { id: "volume", label: "4×10", sets: 4, reps: "10", restSec: 90 },
  { id: "endurance", label: "3×15", sets: 3, reps: "12-15", restSec: 45 },
  { id: "upper40", label: "Верх 40′ · 3×8–12", sets: 3, reps: "8-12", restSec: 70 },
  { id: "fb30", label: "Всё тело 30′ · 3×10–12", sets: 3, reps: "10-12", restSec: 55 },
];

export type WorkoutDayPreset = {
  id: string;
  label: string;
  hint: string;
  /** Prefer these muscle groups when auto-picking from catalog */
  muscles: string[];
  maxExercises: number;
  templateId: string;
};

/** Quick day builders for catalog (P2). */
export const WORKOUT_DAY_PRESETS: WorkoutDayPreset[] = [
  {
    id: "upper40",
    label: "Верх 40′",
    hint: "Грудь · спина · плечи · руки",
    muscles: ["грудь", "спина", "плечи", "бицепс", "трицепс"],
    maxExercises: 6,
    templateId: "upper40",
  },
  {
    id: "fb30",
    label: "Всё тело 30′",
    hint: "Ноги · верх · кор",
    muscles: ["ноги", "грудь", "спина", "кор", "плечи"],
    maxExercises: 5,
    templateId: "fb30",
  },
];

export function defaultSetTemplate(): SetTemplate {
  return SET_TEMPLATES[0]!;
}

/** Pick diverse exercises by preferred muscles (1 per muscle, then fill). */
export function pickPresetExercises(
  catalog: Array<{ id: string; muscle_group: string; name_ru: string }>,
  preset: WorkoutDayPreset,
): string[] {
  const byMuscle = new Map<string, string[]>();
  for (const ex of catalog) {
    const m = (ex.muscle_group || "").toLowerCase();
    if (!byMuscle.has(m)) byMuscle.set(m, []);
    byMuscle.get(m)!.push(ex.id);
  }
  const picked: string[] = [];
  const used = new Set<string>();
  for (const muscle of preset.muscles) {
    if (picked.length >= preset.maxExercises) break;
    const pool = byMuscle.get(muscle.toLowerCase()) || [];
    const id = pool.find((x) => !used.has(x));
    if (id) {
      picked.push(id);
      used.add(id);
    }
  }
  // fill remaining from any
  if (picked.length < preset.maxExercises) {
    for (const ex of catalog) {
      if (picked.length >= preset.maxExercises) break;
      if (used.has(ex.id)) continue;
      picked.push(ex.id);
      used.add(ex.id);
    }
  }
  return picked;
}
