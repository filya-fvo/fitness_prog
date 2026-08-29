import type {
  AdminExercise,
  AdminExercisePayload,
  WeightRule,
} from "@/api/adminExercises";

export type ExerciseDraft = {
  name: string;
  muscleGroup: string;
  secondaryMuscles: string;
  equipment: string;
  difficulty: string;
  weightRule: WeightRule;
  tags: string;
  limitations: string;
  description: string;
  technique: string;
  commonMistakes: string;
  videoUrl: string;
  animationUrl: string;
  thumbnailUrl: string;
  mediaDuration: string;
  mediaSource: "youtube" | "external" | "none";
};

export const EMPTY_EXERCISE_DRAFT: ExerciseDraft = {
  name: "",
  muscleGroup: "",
  secondaryMuscles: "",
  equipment: "",
  difficulty: "1",
  weightRule: "total",
  tags: "",
  limitations: "",
  description: "",
  technique: "",
  commonMistakes: "",
  videoUrl: "",
  animationUrl: "",
  thumbnailUrl: "",
  mediaDuration: "",
  mediaSource: "none",
};

export function splitValues(value: string): string[] {
  const result = value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(result)];
}

export function draftFromExercise(item: AdminExercise): ExerciseDraft {
  return {
    name: item.name_ru,
    muscleGroup: item.muscle_group,
    secondaryMuscles: item.secondary_muscle_groups.join(", "),
    equipment: item.equipment ?? "",
    difficulty: String(item.difficulty),
    weightRule: item.weight_rule,
    tags: item.tags.join(", "),
    limitations: item.limitations.join("\n"),
    description: item.description ?? "",
    technique: item.technique ?? "",
    commonMistakes: item.common_mistakes ?? "",
    videoUrl: item.video_url ?? "",
    animationUrl: item.animation_url ?? "",
    thumbnailUrl: item.thumbnail_url ?? "",
    mediaDuration: item.media_duration_sec == null ? "" : String(item.media_duration_sec),
    mediaSource: item.media_source === "youtube" || item.media_source === "external"
      ? item.media_source
      : "none",
  };
}

export function payloadFromDraft(draft: ExerciseDraft): AdminExercisePayload {
  const nullable = (value: string) => value.trim() || null;
  return {
    name_ru: draft.name.trim(),
    muscle_group: draft.muscleGroup.trim(),
    secondary_muscle_groups: splitValues(draft.secondaryMuscles),
    equipment: nullable(draft.equipment),
    description: nullable(draft.description),
    technique: nullable(draft.technique),
    common_mistakes: nullable(draft.commonMistakes),
    difficulty: Number(draft.difficulty),
    video_url: nullable(draft.videoUrl),
    animation_url: nullable(draft.animationUrl),
    thumbnail_url: nullable(draft.thumbnailUrl),
    media_duration_sec: draft.mediaDuration.trim() ? Number(draft.mediaDuration) : null,
    media_source: draft.mediaSource,
    tags: splitValues(draft.tags),
    limitations: splitValues(draft.limitations),
    weight_rule: draft.weightRule,
  };
}

export function draftsEqual(left: ExerciseDraft, right: ExerciseDraft): boolean {
  return (Object.keys(EMPTY_EXERCISE_DRAFT) as Array<keyof ExerciseDraft>)
    .every((key) => left[key] === right[key]);
}
