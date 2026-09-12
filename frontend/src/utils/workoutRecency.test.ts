import { describe, expect, it } from "vitest";

import { workoutPauseDays } from "@/utils/workoutRecency";

describe("workoutPauseDays", () => {
  it("prefers a newer server completion over a stale offline cache", () => {
    expect(workoutPauseDays({
      today: "2026-09-10",
      cachedLastCompletedDate: "2026-09-03",
      serverLastCompletedDate: "2026-09-10",
    })).toBe(0);
  });

  it("keeps the cached completion when it is newer or the server is unavailable", () => {
    expect(workoutPauseDays({
      today: "2026-09-10",
      cachedLastCompletedDate: "2026-09-09",
      serverLastCompletedDate: "2026-09-07",
    })).toBe(1);
    expect(workoutPauseDays({
      today: "2026-09-10",
      cachedLastCompletedDate: "2026-09-03",
    })).toBe(7);
  });

  it("ignores invalid and future dates", () => {
    expect(workoutPauseDays({
      today: "2026-09-10",
      cachedLastCompletedDate: "not-a-date",
      serverLastCompletedDate: "2026-09-11",
    })).toBeNull();
  });
});
