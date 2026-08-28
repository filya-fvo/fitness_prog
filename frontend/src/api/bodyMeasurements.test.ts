import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteBodyMeasurement,
  fetchBodyMeasurement,
  saveBodyMeasurement,
} from "@/api/bodyMeasurements";
import { apiClient } from "@/api/client";

describe("body measurement weight API", () => {
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
});
