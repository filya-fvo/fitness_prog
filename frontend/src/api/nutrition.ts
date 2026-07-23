import { z } from "zod";

import { apiClient } from "@/api/client";

const productSchema = z.object({
  id: z.string().uuid(),
  name_ru: z.string(),
  barcode: z.string().nullable().optional(),
  calories: z.number(),
  proteins: z.number(),
  fats: z.number(),
  carbs: z.number(),
  category: z.string().nullable().optional(),
  source: z.string(),
});

const logSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  date: z.string(),
  meal_type: z.string(),
  product_id: z.string().uuid(),
  quantity_grams: z.number(),
  calculated_kbj: z.record(z.number()).default({}),
  product: productSchema.nullable().optional(),
});

const targetsSchema = z.object({
  complete: z.boolean(),
  reason: z.string().nullable().optional(),
  formula: z.string().nullable().optional(),
  sex: z.string().nullable().optional(),
  age: z.number().nullable().optional(),
  birth_date: z.string().nullable().optional(),
  weight_kg: z.number().nullable().optional(),
  height_cm: z.number().nullable().optional(),
  activity_level: z.string().nullable().optional(),
  activity_factor: z.number().nullable().optional(),
  bmr: z.number().nullable().optional(),
  tdee: z.number().nullable().optional(),
  calorie_adjustment_pct: z.number().nullable().optional(),
  calories_target: z.number().nullable().optional(),
  macros: z
    .object({
      proteins_g: z.number().optional(),
      fats_g: z.number().optional(),
      carbs_g: z.number().optional(),
    })
    .nullable()
    .optional(),
  primary_goal: z.string().nullable().optional(),
});

const dailySchema = z.object({
  date: z.string(),
  totals: z.object({
    calories: z.number(),
    proteins: z.number(),
    fats: z.number(),
    carbs: z.number(),
  }),
  meals: z.record(z.array(logSchema)),
  targets: targetsSchema.nullable().optional(),
});

export type NutritionProduct = z.infer<typeof productSchema>;
export type NutritionLog = z.infer<typeof logSchema>;
export type DailyNutrition = z.infer<typeof dailySchema>;
export type EnergyTargets = z.infer<typeof targetsSchema>;

export async function searchProducts(q: string): Promise<NutritionProduct[]> {
  const { data } = await apiClient.get("/nutrition/products", { params: { q, limit: 20 } });
  const parsed = z.object({ items: z.array(productSchema), total: z.number() }).parse(data);
  return parsed.items;
}

export async function addNutritionLog(input: {
  productId: string;
  quantityGrams: number;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  date?: string;
}): Promise<NutritionLog> {
  const { data } = await apiClient.post("/nutrition/log", {
    product_id: input.productId,
    quantity_grams: input.quantityGrams,
    meal_type: input.mealType,
    date: input.date,
  });
  return logSchema.parse(data);
}

export async function fetchDailyNutrition(date?: string): Promise<DailyNutrition> {
  const { data } = await apiClient.get("/nutrition/daily", {
    params: date ? { date } : undefined,
  });
  return dailySchema.parse(data);
}

export async function fetchEnergyTargets(): Promise<EnergyTargets> {
  const { data } = await apiClient.get("/nutrition/targets");
  return targetsSchema.parse(data);
}

/** Local KBJU preview while typing grams (per 100g product macros). */
export function previewKbju(product: NutritionProduct, grams: number) {
  const f = grams / 100;
  return {
    calories: Math.round(product.calories * f * 100) / 100,
    proteins: Math.round(product.proteins * f * 100) / 100,
    fats: Math.round(product.fats * f * 100) / 100,
    carbs: Math.round(product.carbs * f * 100) / 100,
  };
}
