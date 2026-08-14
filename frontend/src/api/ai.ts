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
  session_id: z.string().uuid().nullable().optional(),
  remaining_requests: z.number().nullable().optional(),
});

const historySchema = z.object({
  session_id: z.string().uuid().nullable().optional(),
  messages: z.array(
    z.object({
      id: z.string().uuid(),
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      timestamp: z.string(),
    }),
  ),
});

export type AIChatResult = z.infer<typeof chatSchema>;
export type AIAnalyzeResult = z.infer<typeof analyzeSchema>;
export type AIHistoryResult = z.infer<typeof historySchema>;

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

export async function analyzeProgress(
  days = 14,
  history?: { sessionId?: string | null; message?: string | null },
): Promise<AIAnalyzeResult> {
  const { data } = await apiClient.post("/ai/analyze", {
    days,
    session_id: history?.sessionId ?? null,
    message: history?.message ?? null,
  });
  return analyzeSchema.parse(data);
}

export async function fetchAIHistory(day: string, timezoneOffsetMinutes: number): Promise<AIHistoryResult> {
  const { data } = await apiClient.get("/ai/history", {
    params: { day, timezone_offset_minutes: timezoneOffsetMinutes },
  });
  return historySchema.parse(data);
}
