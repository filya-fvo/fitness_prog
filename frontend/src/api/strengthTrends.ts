import { z } from "zod";

import { apiClient } from "@/api/client";

const decimalSchema = z.union([z.number(), z.string()]).transform(Number);
const pointSchema = z.object({
  date: z.string(),
  weight: decimalSchema,
  total_weight: decimalSchema,
  reps: z.number().int().positive(),
  estimated_1rm: decimalSchema,
  weight_mode: z.enum(["total", "per_hand"]).nullable(),
});
const itemSchema = z.object({
  exercise_id: z.string().uuid(),
  name: z.string(),
  muscle_group: z.string().nullable(),
  is_pinned: z.boolean(),
  points: z.array(pointSchema).max(56),
  latest: pointSchema.nullable(),
  previous: pointSchema.nullable(),
  change_percent: decimalSchema.nullable(),
  has_weight_mode_change: z.boolean(),
});
const setsSchema = z.object({
  period_start: z.string(),
  period_end: z.string(),
  period_days: z.literal(56),
  next_workout: z.object({
    date: z.string(),
    title: z.string(),
    items: z.array(itemSchema).max(6),
  }).nullable(),
  best_improvements: z.array(itemSchema).max(3),
  pinned: z.array(itemSchema).max(8),
});

export type StrengthTrendPoint = {
  weight: number;
  totalWeight: number;
  reps: number;
  estimated1rm: number;
  weightMode: "total" | "per_hand" | null;
};
export type StrengthTrendItem = {
  exerciseId: string;
  name: string;
  points: StrengthTrendPoint[];
  latest: StrengthTrendPoint | null;
  changePercent: number | null;
  hasWeightModeChange: boolean;
};
export type StrengthTrendSets = {
  nextWorkout: { date: string; title: string; items: StrengthTrendItem[] } | null;
  bestImprovements: StrengthTrendItem[];
  pinned: StrengthTrendItem[];
};

function mapPoint(point: z.infer<typeof pointSchema>): StrengthTrendPoint {
  return {
    weight: point.weight,
    totalWeight: point.total_weight,
    reps: point.reps,
    estimated1rm: point.estimated_1rm,
    weightMode: point.weight_mode,
  };
}

function mapItem(item: z.infer<typeof itemSchema>): StrengthTrendItem {
  return {
    exerciseId: item.exercise_id,
    name: item.name,
    points: item.points.map(mapPoint),
    latest: item.latest ? mapPoint(item.latest) : null,
    changePercent: item.change_percent,
    hasWeightModeChange: item.has_weight_mode_change,
  };
}

export async function fetchStrengthTrendSets(): Promise<StrengthTrendSets> {
  const { data } = await apiClient.get("/exercises/strength-trends");
  const parsed = setsSchema.parse(data);
  return {
    nextWorkout: parsed.next_workout
      ? {
          date: parsed.next_workout.date,
          title: parsed.next_workout.title,
          items: parsed.next_workout.items.map(mapItem),
        }
      : null,
    bestImprovements: parsed.best_improvements.map(mapItem),
    pinned: parsed.pinned.map(mapItem),
  };
}
