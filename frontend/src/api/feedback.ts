import { z } from "zod";

import { apiClient } from "@/api/client";

const targetSchema = z.object({
  admin_username: z.string().min(1),
  note: z.string().optional(),
});

/** Optional: fetch admin username from backend config. */
export async function fetchFeedbackTarget(): Promise<string> {
  const { data } = await apiClient.get("/feedback/target");
  return targetSchema.parse(data).admin_username;
}

const feedbackResponseSchema = z.object({
  accepted: z.literal(true),
  delivery: z.string(),
});

export async function sendFeedback(input: {
  message: string;
  page?: string;
  client?: "telegram" | "browser";
  appVersion?: string;
  userAgent?: string;
}): Promise<{ accepted: true; delivery: string }> {
  const { data } = await apiClient.post("/feedback", {
    message: input.message,
    page: input.page || "",
    client: input.client || "browser",
    app_version: input.appVersion || "",
    user_agent: input.userAgent || "",
  });
  return feedbackResponseSchema.parse(data);
}
