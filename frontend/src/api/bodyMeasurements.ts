import { z } from "zod";

import { apiClient } from "@/api/client";

export const bodyMeasurementSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  date: z.string(),
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

export type BodyMeasurement = z.infer<typeof bodyMeasurementSchema>;
export type BodyMeasurementField = Exclude<
  keyof BodyMeasurement,
  "id" | "date" | "note" | "sources"
>;

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

export async function fetchBodyMeasurementRange(opts?: {
  days?: number;
  end?: string;
}): Promise<{ start: string; end: string; items: BodyMeasurement[] }> {
  const { data } = await apiClient.get("/measurements/range", {
    params: { days: opts?.days ?? 365, end: opts?.end },
  });
  return bodyMeasurementRangeSchema.parse(data);
}
