/**
 * Auth API: Telegram initData + email OTP → JWT in localStorage (TZ §8).
 */
import { z } from "zod";

import { apiClient, clearStoredToken, getStoredToken, setStoredToken } from "./client";
import { getInitData } from "@/lib/telegram";

const authUserSchema = z.object({
  id: z.string().uuid(),
  telegram_id: z.number().nullable().optional(),
  username: z.string().nullable().optional(),
  auth_email: z.string().nullable().optional(),
  subscription_status: z.string(),
  onboarding_completed: z.boolean().optional().default(false),
});

const authResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  expires_in_days: z.number(),
  user: authUserSchema,
});

const otpRequestSchema = z.object({
  ok: z.boolean().default(true),
  email: z.string(),
  purpose: z.string(),
  expires_in_sec: z.number(),
  channels: z.array(z.string()).default([]),
  message: z.string().default(""),
  debug_code: z.string().nullable().optional(),
});

export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type OtpRequestResponse = z.infer<typeof otpRequestSchema>;

function apiErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "response" in err) {
    const data = (err as { response?: { data?: { detail?: unknown } } }).response?.data;
    const detail = data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

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

export async function requestEmailLoginCode(email: string): Promise<OtpRequestResponse> {
  try {
    const { data } = await apiClient.post("/auth/email/request-code", { email });
    return otpRequestSchema.parse(data);
  } catch (err) {
    throw new Error(apiErrorMessage(err, "Не удалось отправить код"));
  }
}

export async function loginWithEmailCode(email: string, code: string): Promise<AuthResponse> {
  try {
    const { data } = await apiClient.post("/auth/email/verify", { email, code });
    const parsed = authResponseSchema.parse(data);
    setStoredToken(parsed.access_token);
    return parsed;
  } catch (err) {
    throw new Error(apiErrorMessage(err, "Не удалось войти по email"));
  }
}

export async function requestEmailLinkCode(email: string): Promise<OtpRequestResponse> {
  try {
    const { data } = await apiClient.post("/auth/email/link/request-code", { email });
    return otpRequestSchema.parse(data);
  } catch (err) {
    throw new Error(apiErrorMessage(err, "Не удалось отправить код"));
  }
}

export async function verifyEmailLinkCode(email: string, code: string): Promise<AuthUser> {
  try {
    const { data } = await apiClient.post("/auth/email/link/verify", { email, code });
    return authUserSchema.parse(data);
  } catch (err) {
    throw new Error(apiErrorMessage(err, "Не удалось подтвердить email"));
  }
}

export function logout(): void {
  clearStoredToken();
}

export function hasSession(): boolean {
  return Boolean(getStoredToken());
}
