import { z } from "zod";

import { apiClient } from "@/api/client";
import type { CycleReadiness } from "@/utils/cycleTraining";

const dailyMetricSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  date: z.string(),
  sleep_minutes: z.number().int().nullable().optional(),
  steps: z.number().int().nullable().optional(),
  active_minutes: z.number().int().nullable().optional(),
  cycle_readiness: z.enum(["normal", "caution", "reduce", "rest"]).nullable().optional(),
  sources: z.record(z.string()).default({}),
});

const dailyMetricRangeSchema = z.object({
  start: z.string(),
  end: z.string(),
  days: z.array(dailyMetricSchema),
});

export type DailyMetric = z.infer<typeof dailyMetricSchema>;
export type DailyMetricRange = z.infer<typeof dailyMetricRangeSchema>;

export async function fetchDailyMetrics(date?: string): Promise<DailyMetric> {
  const { data } = await apiClient.get("/metrics/daily", {
    params: date ? { date } : undefined,
  });
  return dailyMetricSchema.parse(data);
}

export async function saveDailyMetrics(
  input: {
    sleepMinutes?: number | null;
    steps?: number | null;
    activeMinutes?: number | null;
    cycleReadiness?: CycleReadiness | null;
  },
  date?: string,
): Promise<DailyMetric> {
  const { data } = await apiClient.put(
    "/metrics/daily",
    {
      sleep_minutes: input.sleepMinutes,
      steps: input.steps,
      active_minutes: input.activeMinutes,
      cycle_readiness: input.cycleReadiness,
    },
    { params: date ? { date } : undefined },
  );
  return dailyMetricSchema.parse(data);
}

export async function fetchDailyMetricsRange(opts?: {
  days?: number;
  end?: string;
}): Promise<DailyMetricRange> {
  const { data } = await apiClient.get("/metrics/range", {
    params: { days: opts?.days ?? 14, end: opts?.end },
  });
  return dailyMetricRangeSchema.parse(data);
}
