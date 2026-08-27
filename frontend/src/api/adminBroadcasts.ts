import { z } from "zod";

import { apiClient } from "@/api/client";

const audienceKindSchema = z.enum([
  "all_telegram",
  "active",
  "onboarding_incomplete",
  "inactive_workouts",
  "program",
  "subscription",
]);

const audienceSchema = z.object({
  kind: audienceKindSchema,
  days: z.number().int().positive().nullable().optional(),
  program_id: z.string().uuid().nullable().optional(),
  subscription_status: z.enum(["free", "pro_stars"]).nullable().optional(),
});

const countsSchema = z.object({
  expected: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  sending: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

const campaignSchema = z.object({
  id: z.string().uuid(),
  actor_user_id: z.string().uuid(),
  title: z.string(),
  message_text: z.string(),
  audience: audienceSchema,
  status: z.enum(["draft", "tested", "scheduled", "sending", "completed", "cancelled"]),
  counts: countsSchema,
  tested_at: z.string().datetime({ offset: true }).nullable(),
  scheduled_at: z.string().datetime({ offset: true }).nullable(),
  started_at: z.string().datetime({ offset: true }).nullable(),
  completed_at: z.string().datetime({ offset: true }).nullable(),
  retry_count: z.number().int().nonnegative(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

const listSchema = z.object({
  items: z.array(campaignSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export type AdminBroadcastAudience = z.infer<typeof audienceSchema>;
export type AdminBroadcast = z.infer<typeof campaignSchema>;
export type AdminBroadcastList = z.infer<typeof listSchema>;

export type AdminBroadcastDraft = {
  title: string;
  message_text: string;
  audience: AdminBroadcastAudience;
};

export async function previewBroadcastAudience(audience: AdminBroadcastAudience): Promise<number> {
  const { data } = await apiClient.post("/admin/broadcasts/audience-preview", audience);
  return z.object({ expected_count: z.number().int().nonnegative() }).parse(data).expected_count;
}

export async function listAdminBroadcasts(limit = 20, offset = 0): Promise<AdminBroadcastList> {
  const { data } = await apiClient.get("/admin/broadcasts", { params: { limit, offset } });
  return listSchema.parse(data);
}

export async function createAdminBroadcast(draft: AdminBroadcastDraft): Promise<AdminBroadcast> {
  const { data } = await apiClient.post("/admin/broadcasts", {
    ...draft,
    idempotency_key: crypto.randomUUID(),
  });
  return campaignSchema.parse(data);
}

export async function updateAdminBroadcast(
  id: string,
  draft: AdminBroadcastDraft,
): Promise<AdminBroadcast> {
  const { data } = await apiClient.put(`/admin/broadcasts/${id}`, draft);
  return campaignSchema.parse(data);
}

export async function testAdminBroadcast(id: string): Promise<AdminBroadcast> {
  const { data } = await apiClient.post(`/admin/broadcasts/${id}/test`);
  return campaignSchema.parse(data);
}

export async function launchAdminBroadcast(
  id: string,
  input: { expectedCount: number; confirmationText: string; scheduledAt?: string },
): Promise<AdminBroadcast> {
  const { data } = await apiClient.post(`/admin/broadcasts/${id}/launch`, {
    confirmed: true,
    confirmation_text: input.confirmationText,
    expected_recipient_count: input.expectedCount,
    scheduled_at: input.scheduledAt || null,
  });
  return campaignSchema.parse(data);
}

export async function retryAdminBroadcast(id: string, failed: number): Promise<AdminBroadcast> {
  const { data } = await apiClient.post(`/admin/broadcasts/${id}/retry`, {
    confirmed: true,
    confirmation_text: `ПОВТОРИТЬ ${failed}`,
  });
  return campaignSchema.parse(data);
}

export async function copyAdminBroadcast(id: string): Promise<AdminBroadcast> {
  const { data } = await apiClient.post(`/admin/broadcasts/${id}/copy`, {
    idempotency_key: crypto.randomUUID(),
  });
  return campaignSchema.parse(data);
}

export async function resumeAdminBroadcast(id: string): Promise<AdminBroadcast> {
  const { data } = await apiClient.post(`/admin/broadcasts/${id}/resume`);
  return campaignSchema.parse(data);
}
