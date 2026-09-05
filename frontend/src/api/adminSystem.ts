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
    "llm",
    "ocr",
    "telegram",
    "email",
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

const historyItemSchema = z.object({
  key: checkSchema.shape.key,
  status: statusSchema,
});

const historySnapshotSchema = z.object({
  id: z.string().uuid(),
  captured_at: z.string().datetime({ offset: true }),
  overall_status: statusSchema,
  source: z.enum(["manual", "scheduled"]),
  items: z.array(historyItemSchema),
});

const historyResponseSchema = z.object({
  snapshots: z.array(historySnapshotSchema),
  retention_days: z.number().int().positive(),
});

export type AdminSystemStatus = z.infer<typeof statusSchema>;
export type AdminSystemFact = z.infer<typeof factSchema>;
export type AdminSystemCheck = z.infer<typeof checkSchema>;
export type AdminSystemStatusResponse = z.infer<typeof responseSchema>;
export type AdminSystemHistoryItem = z.infer<typeof historyItemSchema>;
export type AdminSystemHistorySnapshot = z.infer<typeof historySnapshotSchema>;
export type AdminSystemHistoryResponse = z.infer<typeof historyResponseSchema>;

export async function fetchAdminSystemStatus(): Promise<AdminSystemStatusResponse> {
  const { data } = await apiClient.get("/admin/system/status");
  return responseSchema.parse(data);
}

export async function checkAdminSystemStatus(): Promise<AdminSystemStatusResponse> {
  const { data } = await apiClient.post("/admin/system/status/check");
  return responseSchema.parse(data);
}

export async function fetchAdminSystemHistory(limit = 96): Promise<AdminSystemHistoryResponse> {
  const { data } = await apiClient.get("/admin/system/history", { params: { limit } });
  return historyResponseSchema.parse(data);
}
