/**
 * Auth API: Telegram initData or email OTP → JWT in localStorage (TZ §8).
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
  merged_from_user_ids: z.array(z.string().uuid()).optional(),
  last_merge_preference: z.enum(["email", "telegram"]).nullable().optional(),
});

const authResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  expires_in_days: z.number(),
  user: authUserSchema,
});

const telegramBrowserConfigSchema = z.object({
  enabled: z.boolean(),
  client_id: z.number().int().positive().nullable(),
  nonce: z.string().min(32).nullable(),
});

const emailOtpRequestSchema = z.object({
  ok: z.boolean(),
  email: z.string().email(),
  expires_in_sec: z.number(),
  resend_after_sec: z.number(),
  delivery: z.string(),
  message: z.string(),
  dev_code: z.string().optional().nullable(),
  dev_send_error: z.string().optional().nullable(),
});

export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type EmailOtpRequestResult = z.infer<typeof emailOtpRequestSchema>;
export type TelegramBrowserConfig = z.infer<typeof telegramBrowserConfigSchema>;

let telegramLoginInFlight: { payload: string; request: Promise<AuthResponse> } | null = null;

export async function loginWithTelegram(initData?: string): Promise<AuthResponse> {
  const payload = initData ?? getInitData();
  if (!payload) {
    throw new Error("Telegram initData is empty. Open the app inside Telegram.");
  }

  if (telegramLoginInFlight?.payload === payload) {
    return telegramLoginInFlight.request;
  }

  const request = apiClient
    .post("/auth/telegram", { init_data: payload })
    .then(({ data }) => {
      const parsed = authResponseSchema.parse(data);
      setStoredToken(parsed.access_token);
      return parsed;
    })
    .finally(() => {
      if (telegramLoginInFlight?.request === request) {
        telegramLoginInFlight = null;
      }
    });
  telegramLoginInFlight = { payload, request };
  return request;
}

export async function getTelegramBrowserLoginConfig(): Promise<TelegramBrowserConfig> {
  const { data } = await apiClient.get("/auth/telegram/browser/config");
  return telegramBrowserConfigSchema.parse(data);
}

export async function loginWithTelegramIdToken(
  idToken: string,
  nonce: string,
): Promise<AuthResponse> {
  const { data } = await apiClient.post("/auth/telegram/browser", {
    id_token: idToken,
    nonce,
  });
  const parsed = authResponseSchema.parse(data);
  setStoredToken(parsed.access_token);
  return parsed;
}

export async function requestEmailLoginCode(email: string): Promise<EmailOtpRequestResult> {
  const { data } = await apiClient.post("/auth/email/request-code", { email: email.trim() });
  return emailOtpRequestSchema.parse(data);
}

export async function loginWithEmailCode(email: string, code: string): Promise<AuthResponse> {
  const { data } = await apiClient.post("/auth/email/verify", {
    email: email.trim(),
    code: code.trim(),
  });
  const parsed = authResponseSchema.parse(data);
  setStoredToken(parsed.access_token);
  return parsed;
}

const emailLinkResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  user: authUserSchema.nullable().optional(),
  merge_required: z.boolean().optional().default(false),
  merge_preview: z.object({
    conflicts: z.array(z.string()),
    email: z.object({
      email: z.string().nullable().optional(),
      onboarding_completed: z.boolean(),
      counts: z.record(z.string(), z.number()),
    }),
    telegram: z.object({
      username: z.string().nullable().optional(),
      onboarding_completed: z.boolean(),
      counts: z.record(z.string(), z.number()),
    }),
  }).nullable().optional(),
});

export type EmailLinkResult = z.infer<typeof emailLinkResultSchema>;

/** Authenticated: send OTP to attach email to current account. */
export async function requestEmailLinkCode(email: string): Promise<EmailOtpRequestResult> {
  const { data } = await apiClient.post("/auth/email/link/request-code", { email: email.trim() });
  return emailOtpRequestSchema.parse(data);
}

/** Authenticated: verify OTP and save auth_email on current user. */
export async function verifyEmailLinkCode(
  email: string,
  code: string,
  mergePreference?: "email" | "telegram",
): Promise<EmailLinkResult> {
  const { data } = await apiClient.post("/auth/email/link/verify", {
    email: email.trim(),
    code: code.trim(),
    merge_preference: mergePreference,
  });
  return emailLinkResultSchema.parse(data);
}

export function logout(): void {
  clearStoredToken();
}

export function hasSession(): boolean {
  return Boolean(getStoredToken());
}
