import { normalizeMuscleGroup, type MuscleGroupKey } from "@/utils/muscleGroups";

type ExercisePreviewInput = {
  muscle_group: string | null | undefined;
  thumbnail_url: string | null | undefined;
  animation_url: string | null | undefined;
};

export type ExercisePreview =
  | { kind: "image"; src: string }
  | { kind: "animation-frame"; src: string }
  | { kind: "anatomy"; group: MuscleGroupKey };

function cleaned(value: string | null | undefined): string | null {
  const result = value?.trim();
  return result || null;
}

/** Stable list-card visual priority; detailed media remains available in tabs. */
export function resolveExercisePreview(exercise: ExercisePreviewInput): ExercisePreview {
  const thumbnail = cleaned(exercise.thumbnail_url);
  if (thumbnail) return { kind: "image", src: thumbnail };
  const animation = cleaned(exercise.animation_url);
  if (animation) return { kind: "animation-frame", src: animation };
  return { kind: "anatomy", group: normalizeMuscleGroup(exercise.muscle_group) };
}
