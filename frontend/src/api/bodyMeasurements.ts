import { z } from "zod";

import { apiClient } from "@/api/client";

export const bodyMeasurementSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  date: z.string(),
  weight_kg: z.number().nullable().optional(),
  neck_cm: z.number().nullable().optional(),
  shoulders_cm: z.number().nullable().optional(),
  chest_cm: z.number().nullable().optional(),
  waist_cm: z.number().nullable().optional(),
  hips_cm: z.number().nullable().optional(),
  bicep_cm: z.number().nullable().optional(),
  thigh_cm: z.number().nullable().optional(),
  calf_cm: z.number().nullable().optional(),
  note: z.string().nullable().optional(),
  sources: z.record(z.string()).default({}),
});

const bodyMeasurementRangeSchema = z.object({
  start: z.string(),
  end: z.string(),
  items: z.array(bodyMeasurementSchema),
});

const bodyMeasurementAnalyticsItemSchema = z.object({
  field: z.string(),
  points: z.number().int().nonnegative(),
  baseline_value: z.number().nullable(),
  baseline_date: z.string().nullable(),
  latest_value: z.number().nullable(),
  latest_date: z.string().nullable(),
  delta: z.number().nullable(),
  percent_change: z.number().nullable(),
  target_value: z.number().nullable(),
  target_gap: z.number().nullable(),
  interpretation: z.string(),
});

const bodyMeasurementAnalyticsSchema = z.object({
  months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
  start: z.string(),
  end: z.string(),
  primary_goal: z.string().nullable(),
  items: z.array(bodyMeasurementAnalyticsItemSchema),
});

export type BodyMeasurement = z.infer<typeof bodyMeasurementSchema>;
export type BodyMeasurementField = Exclude<
  keyof BodyMeasurement,
  "id" | "date" | "note" | "sources"
>;
export type BodyMeasurementPeriod = 1 | 3 | 6 | 12;
export type BodyMeasurementAnalytics = z.infer<typeof bodyMeasurementAnalyticsSchema>;
export type BodyMeasurementAnalyticsItem = z.infer<typeof bodyMeasurementAnalyticsItemSchema>;

export async function fetchBodyMeasurement(date?: string): Promise<BodyMeasurement> {
  const { data } = await apiClient.get("/measurements/daily", {
    params: date ? { date } : undefined,
  });
  return bodyMeasurementSchema.parse(data);
}

export async function saveBodyMeasurement(
  date: string,
  values: Partial<Record<BodyMeasurementField, number | null>> & { note?: string | null },
): Promise<BodyMeasurement> {
  const { data } = await apiClient.put("/measurements/daily", values, { params: { date } });
  return bodyMeasurementSchema.parse(data);
}

export async function deleteBodyMeasurement(date: string): Promise<void> {
  await apiClient.delete("/measurements/daily", { params: { date } });
}

export async function fetchBodyMeasurementRange(opts?: {
  days?: number;
  end?: string;
}): Promise<{ start: string; end: string; items: BodyMeasurement[] }> {
  const { data } = await apiClient.get("/measurements/range", {
    params: { days: opts?.days ?? 365, end: opts?.end },
  });
  return bodyMeasurementRangeSchema.parse(data);
}

export async function fetchBodyMeasurementAnalytics(opts: {
  months: BodyMeasurementPeriod;
  end: string;
  signal?: AbortSignal;
}): Promise<BodyMeasurementAnalytics> {
  const { data } = await apiClient.get("/measurements/analytics", {
    params: { months: opts.months, end: opts.end },
    signal: opts.signal,
  });
  return bodyMeasurementAnalyticsSchema.parse(data);
}
