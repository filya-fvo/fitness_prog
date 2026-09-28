import { z } from "zod";

import { apiClient } from "@/api/client";

const kbjuSchema = z.object({ calories: z.number(), proteins: z.number(), fats: z.number(), carbs: z.number() });
const correctionSchema = z.object({
  id: z.string().uuid(),
  product_id: z.string().uuid(),
  product_name: z.string(),
  user_id: z.string().uuid(),
  original_kbju: kbjuSchema,
  proposed_kbju: kbjuSchema,
  status: z.enum(["pending", "approved", "rejected", "withdrawn"]),
  created_at: z.string(),
  reviewed_at: z.string().nullable().optional(),
});
const listSchema = z.object({ items: z.array(correctionSchema), total: z.number(), pending_count: z.number() });

export type NutritionCorrection = z.infer<typeof correctionSchema>;
export type CorrectionStatus = NutritionCorrection["status"];

export async function fetchAdminNutritionCorrections(status: CorrectionStatus = "pending", limit = 30) {
  const { data } = await apiClient.get("/admin/nutrition/corrections", { params: { status, limit } });
  return listSchema.parse(data);
}

export async function decideAdminNutritionCorrection(id: string, decision: "approve" | "reject") {
  const { data } = await apiClient.post(`/admin/nutrition/corrections/${id}/decision`, { decision });
  return correctionSchema.parse(data);
}
