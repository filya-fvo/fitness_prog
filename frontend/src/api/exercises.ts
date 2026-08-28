import { z } from "zod";

import { apiClient } from "@/api/client";
import type { Exercise } from "@/types/workout";

export const exerciseSchema = z.object({
  id: z.string().uuid(),
  name_ru: z.string(),
  muscle_group: z.string(),
  secondary_muscle_groups: z.array(z.string()).optional().default([]),
  equipment: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  technique: z.string().nullable().optional(),
  common_mistakes: z.string().nullable().optional(),
  difficulty: z.number(),
  video_url: z.string().nullable().optional(),
  animation_url: z.string().nullable().optional(),
  thumbnail_url: z.string().nullable().optional(),
  media_duration_sec: z.number().nullable().optional(),
  media_source: z.string().optional().default("none"),
  tags: z.array(z.string()).optional().default([]),
  limitations: z.array(z.string()).optional().default([]),
  weight_rule: z.enum(["total", "per_hand", "per_side", "none"]).optional().default("total"),
});

const listSchema = z.object({
  items: z.array(exerciseSchema),
  total: z.number(),
  page: z.number(),
  page_size: z.number(),
});

export function mapExercise(item: z.infer<typeof exerciseSchema>): Exercise {
  return {
    id: item.id,
    name_ru: item.name_ru,
    muscle_group: item.muscle_group,
    secondary_muscle_groups: item.secondary_muscle_groups,
    equipment: item.equipment ?? null,
    description: item.description ?? null,
    technique: item.technique ?? null,
    common_mistakes: item.common_mistakes ?? null,
    difficulty: item.difficulty,
    video_url: item.video_url ?? null,
    animation_url: item.animation_url ?? null,
    thumbnail_url: item.thumbnail_url ?? null,
    media_duration_sec: item.media_duration_sec ?? null,
    media_source: item.media_source ?? "none",
    tags: item.tags ?? [],
    limitations: item.limitations,
    weight_rule: item.weight_rule,
  };
}

export async function fetchExercises(params?: {
  page?: number;
  pageSize?: number;
  muscleGroup?: string;
  equipment?: string;
  q?: string;
  tag?: string;
}): Promise<{ items: Exercise[]; total: number }> {
  const { data } = await apiClient.get("/exercises", {
    params: {
      page: params?.page ?? 1,
      page_size: params?.pageSize ?? 100,
      muscle_group: params?.muscleGroup,
      equipment: params?.equipment,
      q: params?.q,
      tag: params?.tag,
    },
  });
  const parsed = listSchema.parse(data);
  return {
    items: parsed.items.map(mapExercise),
    total: parsed.total,
  };
}
