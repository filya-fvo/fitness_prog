import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteBodyMeasurement,
  fetchBodyMeasurement,
  fetchBodyMeasurementAnalytics,
  saveBodyMeasurement,
} from "@/api/bodyMeasurements";
import { apiClient } from "@/api/client";

describe("body measurement API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads and saves weight with the dated measurement", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({
      data: { date: "2026-08-27", weight_kg: 79.4, sources: { weight_kg: "manual" } },
    });
    vi.spyOn(apiClient, "put").mockResolvedValue({
      data: { date: "2026-08-27", weight_kg: 79.4, sources: { weight_kg: "manual" } },
    });

    const loaded = await fetchBodyMeasurement("2026-08-27");
    const saved = await saveBodyMeasurement("2026-08-27", { weight_kg: 79.4 });

    expect(loaded.weight_kg).toBe(79.4);
    expect(saved.weight_kg).toBe(79.4);
    expect(apiClient.put).toHaveBeenCalledWith(
      "/measurements/daily",
      { weight_kg: 79.4 },
      { params: { date: "2026-08-27" } },
    );
  });

  it("deletes only the selected dated measurement", async () => {
    vi.spyOn(apiClient, "delete").mockResolvedValue({ data: null });

    await deleteBodyMeasurement("2026-08-27");

    expect(apiClient.delete).toHaveBeenCalledWith(
      "/measurements/daily",
      { params: { date: "2026-08-27" } },
    );
  });

  it("requests a bounded analytics period and validates aggregate fields", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: {
      months: 3,
      start: "2026-05-28",
      end: "2026-08-28",
      primary_goal: "lose_fat",
      items: [{
        field: "weight_kg",
        points: 2,
        baseline_value: 82,
        baseline_date: "2026-05-28",
        latest_value: 79,
        latest_date: "2026-08-28",
        delta: -3,
        percent_change: -3.7,
        target_value: 75,
        target_gap: 4,
        interpretation: "Значение стало ближе к заданной цели",
      }],
    } });
    const controller = new AbortController();

    const result = await fetchBodyMeasurementAnalytics({
      months: 3,
      end: "2026-08-28",
      signal: controller.signal,
    });

    expect(apiClient.get).toHaveBeenCalledWith("/measurements/analytics", {
      params: { months: 3, end: "2026-08-28" },
      signal: controller.signal,
    });
    expect(result.items[0].percent_change).toBe(-3.7);
    expect(result.items[0].target_value).toBe(75);
  });
});
