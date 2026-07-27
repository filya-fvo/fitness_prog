import { z } from "zod";

import { apiClient } from "@/api/client";

const profileSchema = z.object({
  id: z.string().uuid(),
  telegram_id: z.number(),
  username: z.string().nullable().optional(),
  anthropometry: z.record(z.unknown()).default({}),
  goals: z.record(z.unknown()).default({}),
  subscription_status: z.string(),
  stars_balance: z.number().default(0),
  onboarding_completed: z.boolean().default(false),
});

export type UserProfile = z.infer<typeof profileSchema>;

export async function fetchMyProfile(): Promise<UserProfile> {
  const { data } = await apiClient.get("/users/me");
  return profileSchema.parse(data);
}

export async function updateMyProfile(input: {
  anthropometry?: Record<string, unknown>;
  goals?: Record<string, unknown>;
}): Promise<UserProfile> {
  const { data } = await apiClient.put("/users/me", input);
  return profileSchema.parse(data);
}
