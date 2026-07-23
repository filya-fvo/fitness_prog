/**
 * Auth API: send initData → JWT in localStorage (TZ §8).
 */
import { z } from "zod";

import { apiClient, clearStoredToken, getStoredToken, setStoredToken } from "./client";
import { getInitData } from "@/lib/telegram";

const authUserSchema = z.object({
  id: z.string().uuid(),
  telegram_id: z.number(),
  username: z.string().nullable().optional(),
  subscription_status: z.string(),
  onboarding_completed: z.boolean().optional().default(false),
});

const authResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  expires_in_days: z.number(),
  user: authUserSchema,
});

export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;

export async function loginWithTelegram(initData?: string): Promise<AuthResponse> {
  const payload = initData ?? getInitData();
  if (!payload) {
    throw new Error("Telegram initData is empty. Open the app inside Telegram.");
  }

  const { data } = await apiClient.post("/auth/telegram", { init_data: payload });
  const parsed = authResponseSchema.parse(data);
  setStoredToken(parsed.access_token);
  return parsed;
}

export function logout(): void {
  clearStoredToken();
}

export function hasSession(): boolean {
  return Boolean(getStoredToken());
}
