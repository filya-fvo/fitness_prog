import { z } from "zod";

import { apiClient } from "@/api/client";

const statusSchema = z.enum(["normal", "attention", "error", "no_data"]);

const factSchema = z.object({
  label: z.string(),
  value: z.string(),
  kind: z.enum(["text", "number", "datetime"]),
});

const checkSchema = z.object({
  key: z.enum([
    "api",
    "database",
    "redis",
    "worker",
    "notifications",
    "queue",
    "backup",
    "deployment",
    "https",
  ]),
  title: z.string(),
  status: statusSchema,
  summary: z.string(),
  next_step: z.string(),
  observed_at: z.string().datetime({ offset: true }).nullable().optional(),
  facts: z.array(factSchema),
});

const responseSchema = z.object({
  checked_at: z.string().datetime({ offset: true }),
  overall_status: statusSchema,
  items: z.array(checkSchema),
});

export type AdminSystemStatus = z.infer<typeof statusSchema>;
export type AdminSystemFact = z.infer<typeof factSchema>;
export type AdminSystemCheck = z.infer<typeof checkSchema>;
export type AdminSystemStatusResponse = z.infer<typeof responseSchema>;

export async function fetchAdminSystemStatus(): Promise<AdminSystemStatusResponse> {
  const { data } = await apiClient.get("/admin/system/status");
  return responseSchema.parse(data);
}
