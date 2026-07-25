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

export async function searchProducts(
  q: string,
  opts?: { limit?: number; offset?: number; category?: string },
): Promise<{ items: NutritionProduct[]; total: number }> {
  const { data } = await apiClient.get("/nutrition/products", {
    params: {
      q,
      limit: opts?.limit ?? 30,
      offset: opts?.offset ?? 0,
      category: opts?.category || undefined,
    },
  });
  return z.object({ items: z.array(productSchema), total: z.number() }).parse(data);
}

export async function fetchProductCategories(): Promise<string[]> {
  const { data } = await apiClient.get("/nutrition/categories");
  const parsed = z.object({ items: z.array(z.string()), total: z.number() }).parse(data);
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

const rangeDaySchema = z.object({
  date: z.string(),
  calories: z.number(),
  proteins: z.number().optional().default(0),
  fats: z.number().optional().default(0),
  carbs: z.number().optional().default(0),
  has_logs: z.boolean().optional().default(false),
  target_calories: z.number().nullable().optional(),
  delta_calories: z.number().nullable().optional(),
});

const rangeSchema = z.object({
  start: z.string(),
  end: z.string(),
  days: z.array(rangeDaySchema),
  targets: targetsSchema.nullable().optional(),
  daily_target_calories: z.number().nullable().optional(),
  period_target_calories: z.number().nullable().optional(),
  period_eaten_calories: z.number().optional().default(0),
  period_delta_calories: z.number().nullable().optional(),
});

export type NutritionRangeDay = z.infer<typeof rangeDaySchema>;
export type NutritionRange = z.infer<typeof rangeSchema>;

export async function fetchNutritionRange(opts?: {
  days?: number;
  end?: string;
}): Promise<NutritionRange> {
  const { data } = await apiClient.get("/nutrition/range", {
    params: {
      days: opts?.days ?? 7,
      end: opts?.end,
    },
  });
  return rangeSchema.parse(data);
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
