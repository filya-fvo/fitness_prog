import type { Exercise, WorkoutPlanExercise } from "@/types/workout";
import { inferLoadType } from "@/utils/exerciseLoadType";

export type ExerciseReplacement = {
  fromExercise: Exercise;
  toExercise: Exercise;
};

export type BulkReplacementPlan = {
  replacements: ExerciseReplacement[];
  completedSkipped: number;
  noEquivalentSkipped: number;
};

type MovementFamily =
  | "horizontal_press"
  | "vertical_press"
  | "chest_fly"
  | "vertical_pull"
  | "horizontal_pull"
  | "hip_hinge"
  | "squat"
  | "lunge"
  | "leg_extension"
  | "leg_curl"
  | "hip_thrust"
  | "calves"
  | "lateral_raise"
  | "rear_delts"
  | "shrug"
  | "biceps"
  | "triceps"
  | "core_hold"
  | "core_flexion"
  | "core_rotation"
  | "cardio_machine"
  | "cardio_body";

function hasCompatibleLoadType(source: Exercise, candidate: Exercise): boolean {
  const sourceType = inferLoadType(source);
  const candidateType = inferLoadType(candidate);
  if (sourceType === candidateType) return true;
  return (
    (sourceType === "weight_reps" || sourceType === "reps_only") &&
    (candidateType === "weight_reps" || candidateType === "reps_only")
  );
}

function textOf(exercise: Pick<Exercise, "name_ru">): string {
  return (exercise.name_ru || "").toLowerCase().replaceAll("ё", "е");
}

export function movementFamily(exercise: Pick<Exercise, "name_ru">): MovementFamily | null {
  const name = textOf(exercise);
  if (/беговая|эллипс|велотренажер|гребн/.test(name)) return "cardio_machine";
  if (/берпи|альпинист|скакал|звезд|скейтер|высокие колени|медвежья/.test(name)) {
    return "cardio_body";
  }
  if (/жим.*(лежа|наклон)|жим в тренажере|отжиман|брусьях/.test(name)) {
    return "horizontal_press";
  }
  if (/разведен.*лежа|сведен.*(кроссов|тренаж|бабочк)|кроссовер.*блок/.test(name)) return "chest_fly";
  if (/жим.*(стоя|сидя)|жим арнольда/.test(name)) return "vertical_press";
  if (/австралийские подтягивания/.test(name)) return "horizontal_pull";
  if (/подтягив|верхнего блока|верхний блок|пуловер в блоке/.test(name)) {
    return "vertical_pull";
  }
  if (/тяг.*(наклон|горизонт|нижнего блока|т-гриф|резинк.*пояс|упор.*груд)/.test(name)) {
    return "horizontal_pull";
  }
  if (/пуловер с гантелью/.test(name)) return "vertical_pull";
  if (/становая|румынская|махи гирей/.test(name)) return "hip_hinge";
  if (/болгар|выпад|зашагив/.test(name)) return "lunge";
  if (/присед|жим ногами/.test(name)) return "squat";
  if (/разгибания ног/.test(name)) return "leg_extension";
  if (/сгибания ног/.test(name)) return "leg_curl";
  if (/ягодичный мост/.test(name)) return "hip_thrust";
  if (/подъемы на носки/.test(name)) return "calves";
  if (/разводка.*сторон|махи.*сторон|подъемы гантелей перед|отведен.*сторон.*блок/.test(name)) {
    return "lateral_raise";
  }
  if (/разводка в наклоне|обратные разведения|тяга к лицу/.test(name)) return "rear_delts";
  if (/шраги/.test(name)) return "shrug";
  if (/сгибания.*бицепс|сгибания со штангой|молотковые|скамье скотта|нижнем блоке/.test(name)) {
    return "biceps";
  }
  if (/разгибания.*(блок|головы)|француз|жим.*узким|узким хватом/.test(name)) {
    return "triceps";
  }
  if (/планка|мертвый жук|птица-собака|удержание.*лодочки/.test(name)) {
    return "core_hold";
  }
  if (/русские скручивания|паллоф/.test(name)) return "core_rotation";
  if (/скручиван|подъемы ног|велосипед/.test(name)) return "core_flexion";
  if (/поворот/.test(name)) return "core_rotation";
  return null;
}

export function equipmentGroup(exercise: Pick<Exercise, "equipment">): string {
  const equipment = (exercise.equipment || "").toLowerCase().replaceAll("ё", "е");
  if (/свой вес/.test(equipment)) return "bodyweight";
  if (/резин/.test(equipment)) return "bands";
  if (/гантел/.test(equipment)) return "dumbbells";
  if (/штанг/.test(equipment)) return "barbell";
  if (/тренаж|блок|кроссов|смита|эллипс/.test(equipment)) return "machines";
  return equipment.trim();
}

function violatesLimitations(exercise: Exercise, limitations: Set<string>): boolean {
  const name = textOf(exercise);
  if (
    limitations.has("no_knee") &&
    /присед|выпад|болгар|жим ногами|зашагив|прыж|берпи|скейтер|высокие колени/.test(name)
  ) {
    return true;
  }
  if (
    limitations.has("no_spine") &&
    /станов|румын|наклоне|гиперэкстенз/.test(name)
  ) {
    return true;
  }
  if (limitations.has("shoulder_sensitive")) {
    const upperPress = /жим/.test(name) && !/жим (ногами|вниз)/.test(name);
    const shoulderRisk =
      upperPress ||
      /отжим|брусь|подтягив|верхнего блока|верхний блок|пуловер|развед|развод|махи|подъёмы гантелей перед|тяга к лицу|тяга к подбородку|планк|птица-собака|медвеж|фермер|из-за головы|француз/.test(name) ||
      /тяга.*(горизонт|нижнего блока|т-гриф|наклон|резинк.*пояс|упор.*груд)/.test(name);
    const shoulderLoadedSquat =
      /приседания со штангой|фронтальные приседания|сумо-приседания|машине смита|гакк-приседания/.test(name);
    if (shoulderRisk || shoulderLoadedSquat) return true;
  }
  return false;
}

export function rankEquivalentExercises(
  source: Exercise,
  catalog: Exercise[],
  options?: {
    excludedIds?: Set<string>;
    allowedEquipment?: Set<string>;
    limitations?: Set<string>;
  },
): Exercise[] {
  const family = movementFamily(source);
  if (!family) return [];
  const sourceEquipment = equipmentGroup(source);
  const sourceMuscle = (source.muscle_group || "").toLowerCase();
  const excludedIds = options?.excludedIds ?? new Set<string>();
  const limitations = options?.limitations ?? new Set<string>();

  return catalog
    .filter((candidate) => candidate.id !== source.id && !excludedIds.has(candidate.id))
    .filter((candidate) => movementFamily(candidate) === family)
    .filter((candidate) => hasCompatibleLoadType(source, candidate))
    .filter((candidate) => Math.abs(candidate.difficulty - source.difficulty) <= 1)
    .filter((candidate) => {
      const allowed = options?.allowedEquipment;
      const group = equipmentGroup(candidate);
      // Bodyweight needs no inventory and is available at every location.
      return !allowed?.size || group === "bodyweight" || allowed.has(group);
    })
    .filter((candidate) => !violatesLimitations(candidate, limitations))
    .map((candidate) => {
      let score = 20;
      if ((candidate.muscle_group || "").toLowerCase() === sourceMuscle) score += 5;
      if (candidate.difficulty === source.difficulty) score += 3;
      if (equipmentGroup(candidate) !== sourceEquipment) score += 4;
      return { candidate, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score || a.candidate.name_ru.localeCompare(b.candidate.name_ru, "ru"),
    )
    .map((row) => row.candidate);
}

export function buildBulkReplacementPlan(input: {
  planExercises: WorkoutPlanExercise[];
  catalog: Exercise[];
  completedExerciseIds: Set<string>;
  allowedEquipment?: Set<string>;
  limitations?: Set<string>;
}): BulkReplacementPlan {
  const byId = new Map(input.catalog.map((exercise) => [exercise.id, exercise]));
  const excludedIds = new Set(input.planExercises.map((item) => item.exercise_id));
  const replacements: ExerciseReplacement[] = [];
  let completedSkipped = 0;
  let noEquivalentSkipped = 0;

  for (const item of [...input.planExercises].sort((a, b) => a.order - b.order)) {
    if (input.completedExerciseIds.has(item.exercise_id)) {
      completedSkipped += 1;
      continue;
    }
    const source = byId.get(item.exercise_id);
    if (!source) {
      noEquivalentSkipped += 1;
      continue;
    }
    const candidate = rankEquivalentExercises(source, input.catalog, {
      excludedIds,
      allowedEquipment: input.allowedEquipment,
      limitations: input.limitations,
    })[0];
    if (!candidate) {
      noEquivalentSkipped += 1;
      continue;
    }
    replacements.push({ fromExercise: source, toExercise: candidate });
    excludedIds.add(candidate.id);
  }

  return { replacements, completedSkipped, noEquivalentSkipped };
}
