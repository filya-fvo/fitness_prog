import type { Exercise } from "@/types/workout";
import { enumLabel } from "@/utils/localization";

export function exerciseMuscles(exercise: Exercise): Array<{ group: string; label: string }> {
  const tagged = exercise.tags
    .filter((tag) => tag.startsWith("secondary:"))
    .map((tag) => tag.slice("secondary:".length));
  const groups = [exercise.muscle_group, ...(exercise.secondary_muscle_groups?.length
    ? exercise.secondary_muscle_groups : tagged)];
  const unique = new Set<string>();
  return groups.flatMap((group) => {
    const label = enumLabel(group, "");
    if (!label || unique.has(label.toLowerCase())) return [];
    unique.add(label.toLowerCase());
    return [{ group, label }];
  });
}

export function exerciseMediaLabels(exercise: Exercise): string[] {
  return [
    exercise.thumbnail_url || exercise.animation_url ? "Фото" : null,
    exercise.animation_url ? "GIF" : null,
    exercise.video_url ? "Видео" : null,
  ].filter((label): label is string => Boolean(label));
}

export function exerciseSteps(technique: string | null | undefined): string[] {
  return (technique || "")
    .split(/\n+/)
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

export function exerciseDescription(exercise: Exercise): string | null {
  const description = exercise.description?.trim();
  if (!description) return null;
  if (/Цель:.*Оборудование:.*Gym Visual/i.test(description)) return null;
  return description;
}
