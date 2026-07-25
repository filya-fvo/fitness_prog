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
