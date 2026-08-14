import { z } from "zod";

import { apiClient } from "@/api/client";

const scheduleItemSchema = z.object({
  slot: z.string(),
  days: z.enum(["every", "workout", "rest"]).or(z.string()).default("every"),
});

const entrySchema = z.object({
  id: z.string(),
  key: z.string(),
  name_ru: z.string(),
  dose: z.string().default(""),
  times: z.array(z.string()).default([]),
  schedule: z.array(scheduleItemSchema).default([]),
  enabled: z.boolean().default(true),
  custom: z.boolean().default(false),
  notes: z.string().default(""),
});

const catalogItemSchema = z
  .object({
    key: z.string(),
    name_ru: z.string(),
    category: z.string().optional(),
    mechanism: z.string().optional(),
    effects: z.string().optional(),
    default_dose: z.string().optional(),
    dose_notes: z.string().optional(),
    default_times: z.array(z.string()).optional(),
    recommended: z.boolean().optional(),
    with_food: z.boolean().optional(),
  })
  .passthrough();

const stackSchema = z.object({
  items: z.array(entrySchema),
  catalog: z.array(catalogItemSchema),
});

const intakeSchema = z.object({
  id: z.string().uuid(),
  supplement_entry_id: z.string(),
  supplement_key: z.string(),
  name_ru: z.string(),
  dose: z.string(),
  slot: z.string(),
  scheduled_at: z.string(),
  status: z.enum(["pending", "taken", "skipped"]),
  completed_at: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
});

const intakeDaySchema = z.object({
  date: z.string(),
  timezone: z.string(),
  total: z.number(),
  taken: z.number(),
  skipped: z.number(),
  pending: z.number(),
  items: z.array(intakeSchema),
});

export type SupplementEntry = z.infer<typeof entrySchema>;
export type SupplementCatalogItem = z.infer<typeof catalogItemSchema>;
export type SupplementStack = z.infer<typeof stackSchema>;
export type SupplementIntake = z.infer<typeof intakeSchema>;
export type SupplementIntakeDay = z.infer<typeof intakeDaySchema>;

export async function fetchSupplementStack(): Promise<SupplementStack> {
  const { data } = await apiClient.get("/supplements/stack");
  return stackSchema.parse(data);
}

export async function saveSupplementStack(items: SupplementEntry[]): Promise<SupplementStack> {
  const { data } = await apiClient.put("/supplements/stack", { items });
  return stackSchema.parse(data);
}

export async function addSupplementFromCatalog(key: string): Promise<SupplementStack> {
  const { data } = await apiClient.post("/supplements/stack/from-catalog", { key });
  return stackSchema.parse(data);
}

export async function addCustomSupplement(input: {
  name_ru: string;
  dose?: string;
  times?: string[];
  notes?: string;
  key?: string;
}): Promise<SupplementStack> {
  const { data } = await apiClient.post("/supplements/stack/custom", input);
  return stackSchema.parse(data);
}

export async function removeSupplement(entryId: string): Promise<SupplementStack> {
  const { data } = await apiClient.delete(`/supplements/stack/${entryId}`);
  return stackSchema.parse(data);
}

export async function fetchTodaySupplementIntakes(date?: string): Promise<SupplementIntakeDay> {
  const { data } = await apiClient.get("/supplements/intakes/today", {
    params: date ? { date_value: date } : undefined,
  });
  return intakeDaySchema.parse(data);
}

export async function markSupplementIntake(
  intakeId: string,
  status: "pending" | "taken" | "skipped",
): Promise<SupplementIntake> {
  const { data } = await apiClient.put(`/supplements/intakes/${intakeId}`, { status });
  return intakeSchema.parse(data);
}

export async function markSupplementIntakeGroup(
  intakeId: string,
  status: "pending" | "taken" | "skipped",
): Promise<SupplementIntake[]> {
  const { data } = await apiClient.put(`/supplements/intakes/${intakeId}/group`, { status });
  return z.array(intakeSchema).parse(data);
}
