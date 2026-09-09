import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import { fetchStrengthTrendSets } from "./strengthTrends";

const exerciseId = "11111111-1111-4111-8111-111111111111";

describe("strength trend sets API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("maps the three explainable strength trend sets", async () => {
    const point = {
      date: "2026-09-08",
      weight: "40.0",
      total_weight: "80.0",
      reps: 8,
      estimated_1rm: "101.3",
      weight_mode: "per_hand" as const,
    };
    const item = {
      exercise_id: exerciseId,
      name: "Жим гантелей",
      muscle_group: "грудь",
      is_pinned: true,
      points: [point],
      latest: point,
      previous: null,
      change_percent: "12.5",
      has_weight_mode_change: false,
    };
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: {
      period_start: "2026-07-16",
      period_end: "2026-09-09",
      period_days: 56,
      next_workout: { date: "2026-09-10", title: "Тренировка A", items: [item] },
      best_improvements: [item],
      pinned: [item],
    } });

    const result = await fetchStrengthTrendSets();

    expect(apiClient.get).toHaveBeenCalledWith("/exercises/strength-trends");
    expect(result.nextWorkout?.items[0]).toMatchObject({
      exerciseId,
      changePercent: 12.5,
      hasWeightModeChange: false,
      latest: { weight: 40, totalWeight: 80, estimated1rm: 101.3 },
    });
    expect(result.bestImprovements).toHaveLength(1);
    expect(result.pinned).toHaveLength(1);
  });
});
