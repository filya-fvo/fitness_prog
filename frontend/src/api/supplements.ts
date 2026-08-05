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

export type SupplementEntry = z.infer<typeof entrySchema>;
export type SupplementCatalogItem = z.infer<typeof catalogItemSchema>;
export type SupplementStack = z.infer<typeof stackSchema>;

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
