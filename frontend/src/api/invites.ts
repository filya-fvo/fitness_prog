import { z } from "zod";

import { apiClient } from "@/api/client";

const createdInviteSchema = z.object({
  id: z.string().uuid(),
  token: z.string().min(32),
  code: z.string().min(6),
  web_url: z.string().url(),
  telegram_url: z.string().url().nullable(),
  expires_at: z.string().datetime({ offset: true }),
});

const invitePreviewSchema = z.object({
  inviter_label: z.string().min(1),
  expires_at: z.string().datetime({ offset: true }),
  already_accepted: z.boolean(),
});

const inviteAcceptSchema = z.object({
  accepted: z.boolean(),
  already_accepted: z.boolean(),
  inviter_label: z.string().min(1),
});

export type CreatedInvite = z.infer<typeof createdInviteSchema>;
export type InvitePreview = z.infer<typeof invitePreviewSchema>;
export type InviteAcceptResult = z.infer<typeof inviteAcceptSchema>;

export async function createInvite(): Promise<CreatedInvite> {
  const { data } = await apiClient.post("/invites");
  return createdInviteSchema.parse(data);
}

export async function previewInvite(value: string): Promise<InvitePreview> {
  const { data } = await apiClient.post("/invites/preview", { value: value.trim() });
  return invitePreviewSchema.parse(data);
}

export async function acceptInvite(value: string): Promise<InviteAcceptResult> {
  const { data } = await apiClient.post("/invites/accept", { value: value.trim() });
  return inviteAcceptSchema.parse(data);
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await apiClient.post(`/invites/${inviteId}/revoke`);
}
