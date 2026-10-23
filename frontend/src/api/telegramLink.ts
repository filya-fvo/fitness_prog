import { z } from "zod";
import { apiClient } from "./client";
import { emailLinkResultSchema } from "./auth";

const startedSchema = z.object({
  request_id: z.string().uuid(),
  bot_url: z.string().regex(/^https:\/\/t\.me\/[A-Za-z0-9_]{5,32}\?start=telegram_link_[A-Za-z0-9_-]{43}$/),
  expires_in_sec: z.number().int().positive().max(300),
});
const statusSchema = z.object({ state: z.enum(["waiting", "ready"]), display_name: z.string().max(300).optional() });
const resultSchema = emailLinkResultSchema.extend({ access_token: z.string().min(1).optional(), merge_target_id: z.string().uuid().optional() });
export type TelegramLinkProof = { request_id: string; verifier: string };
export type TelegramLinkResult = z.infer<typeof resultSchema>;

export async function startTelegramLink(challenge: string) {
  const { data } = await apiClient.post("/auth/telegram/link/start", { challenge });
  return startedSchema.parse(data);
}
export async function telegramLinkStatus(proof: TelegramLinkProof) {
  const { data } = await apiClient.post("/auth/telegram/link/status", proof);
  return statusSchema.parse(data);
}
export async function cancelTelegramLink(proof: TelegramLinkProof) {
  await apiClient.post("/auth/telegram/link/cancel", proof);
}
export async function completeTelegramLink(proof: TelegramLinkProof, merge_preference?: "email" | "telegram", merge_target_id?: string) {
  const { data } = await apiClient.post("/auth/telegram/link/complete", { ...proof, merge_preference, merge_target_id });
  return resultSchema.parse(data);
}
