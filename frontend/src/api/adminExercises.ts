import { z } from "zod";

import { apiClient } from "@/api/client";
import { exerciseSchema } from "@/api/exercises";

export const mediaQualitySchema = z.enum(["ready", "unverified", "missing", "rejected"]);
const weightRuleSchema = z.enum(["total", "per_hand", "per_side", "none"]);

const adminExerciseSchema = exerciseSchema.extend({
  weight_rule: weightRuleSchema,
  media_quality: mediaQualitySchema,
  workout_uses: z.number().int().nonnegative().default(0),
  program_uses: z.number().int().nonnegative().default(0),
  is_archived: z.boolean().default(false),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

const listSchema = z.object({
  items: z.array(adminExerciseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.number().int().positive(),
});

const optionsSchema = z.object({
  muscle_groups: z.array(z.string()),
  equipment: z.array(z.string()),
  tags: z.array(z.string()),
});

const duplicateSchema = z.object({
  id: z.string().uuid(),
  name_ru: z.string(),
  similarity: z.number().min(0).max(1),
});

const mediaCheckSchema = z.object({
  field: z.enum(["video_url", "animation_url", "thumbnail_url"]),
  url: z.string(),
  preview_url: z.string().nullable(),
  available: z.boolean(),
  mime_type: z.string().nullable(),
  size_bytes: z.number().int().nonnegative().nullable(),
  status: z.enum(["ok", "warning", "error"]),
  message: z.string(),
});

const preflightSchema = z.object({
  valid: z.boolean(),
  media: z.array(mediaCheckSchema),
  duplicates: z.array(duplicateSchema),
  errors: z.array(z.string()),
});

const importPreviewSchema = z.object({
  total: z.number().int().nonnegative(),
  valid: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  rows: z.array(z.object({
    row: z.number().int().positive(),
    name_ru: z.string().nullable(),
    valid: z.boolean(),
    errors: z.array(z.string()),
    duplicates: z.array(duplicateSchema),
  })),
});

const importApplySchema = z.object({
  imported: z.number().int().positive().max(500),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});

export type AdminExercise = z.infer<typeof adminExerciseSchema>;
export type AdminExerciseOptions = z.infer<typeof optionsSchema>;
export type ExercisePreflight = z.infer<typeof preflightSchema>;
export type ExerciseImportPreview = z.infer<typeof importPreviewSchema>;
export type MediaQuality = z.infer<typeof mediaQualitySchema>;
export type WeightRule = z.infer<typeof weightRuleSchema>;

export type AdminExercisePayload = {
  name_ru: string;
  muscle_group: string;
  secondary_muscle_groups: string[];
  equipment: string | null;
  description: string | null;
  technique: string | null;
  common_mistakes: string | null;
  difficulty: number;
  video_url: string | null;
  animation_url: string | null;
  thumbnail_url: string | null;
  media_duration_sec: number | null;
  media_source: "youtube" | "external" | "none";
  tags: string[];
  limitations: string[];
  weight_rule: WeightRule;
};

export type AdminExerciseFilters = {
  page: number;
  pageSize: number;
  q?: string;
  muscleGroup?: string;
  equipment?: string;
  difficulty?: number;
  tag?: string;
  weightRule?: WeightRule;
  mediaQuality?: MediaQuality;
  archived?: boolean;
};

export async function listAdminExercises(filters: AdminExerciseFilters) {
  const { data } = await apiClient.get("/admin/exercises", { params: {
    page: filters.page,
    page_size: filters.pageSize,
    q: filters.q || undefined,
    muscle_group: filters.muscleGroup || undefined,
    equipment: filters.equipment || undefined,
    difficulty: filters.difficulty || undefined,
    tag: filters.tag || undefined,
    weight_rule: filters.weightRule || undefined,
    media_quality: filters.mediaQuality || undefined,
    archived: filters.archived || undefined,
  } });
  return listSchema.parse(data);
}

export async function getAdminExerciseOptions(): Promise<AdminExerciseOptions> {
  const { data } = await apiClient.get("/admin/exercises/options");
  return optionsSchema.parse(data);
}

export async function preflightAdminExercise(
  payload: AdminExercisePayload,
  excludeId?: string,
): Promise<ExercisePreflight> {
  const { data } = await apiClient.post("/admin/exercises/preflight", {
    ...payload,
    exclude_id: excludeId || null,
  });
  return preflightSchema.parse(data);
}

export async function createAdminExercise(payload: AdminExercisePayload): Promise<AdminExercise> {
  const { data } = await apiClient.post("/admin/exercises", payload);
  return adminExerciseSchema.parse(data);
}

export async function updateAdminExercise(
  id: string,
  payload: AdminExercisePayload,
): Promise<AdminExercise> {
  const { data } = await apiClient.put(`/admin/exercises/${id}`, payload);
  return adminExerciseSchema.parse(data);
}

export async function archiveAdminExercise(id: string): Promise<void> {
  await apiClient.delete(`/admin/exercises/${id}`);
}

export async function restoreAdminExercise(id: string): Promise<AdminExercise> {
  const { data } = await apiClient.post(`/admin/exercises/${id}/restore`);
  return adminExerciseSchema.parse(data);
}

export async function previewExerciseImport(items: Array<Record<string, unknown>>) {
  const { data } = await apiClient.post("/admin/exercises/import/preview", { items });
  return importPreviewSchema.parse(data);
}

export async function applyExerciseImport(
  items: Array<Record<string, unknown>>,
  fingerprint: string,
) {
  const { data } = await apiClient.post("/admin/exercises/import/apply", {
    items,
    fingerprint,
    confirmed: true,
  });
  return importApplySchema.parse(data);
}
