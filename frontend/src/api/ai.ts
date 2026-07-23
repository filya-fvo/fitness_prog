import { z } from "zod";

import { apiClient } from "@/api/client";

const chatSchema = z.object({
  session_id: z.string().uuid(),
  reply: z.string(),
  source: z.string(),
  remaining_requests: z.number().nullable().optional(),
});

const analyzeSchema = z.object({
  report: z.string(),
  source: z.string(),
  remaining_requests: z.number().nullable().optional(),
});

export type AIChatResult = z.infer<typeof chatSchema>;
export type AIAnalyzeResult = z.infer<typeof analyzeSchema>;

export async function sendAIChat(input: {
  message: string;
  sessionId?: string | null;
}): Promise<AIChatResult> {
  const { data } = await apiClient.post("/ai/chat", {
    message: input.message,
    session_id: input.sessionId ?? null,
  });
  return chatSchema.parse(data);
}

export async function analyzeProgress(days = 14): Promise<AIAnalyzeResult> {
  const { data } = await apiClient.post("/ai/analyze", { days });
  return analyzeSchema.parse(data);
}
