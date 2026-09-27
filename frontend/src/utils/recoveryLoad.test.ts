import { describe, expect, it } from "vitest";

import { pairWeeklyLoadAndSleep } from "@/utils/recoveryLoad";

describe("pairWeeklyLoadAndSleep", () => {
  it("pairs local day sleep only with the matching load week", () => {
    const rows = pairWeeklyLoadAndSleep(
      [
        { week_start: "2026-09-07", week_end: "2026-09-13", completed_workouts: 2, completed_sets: 8, planned_sets: 10, volume_kg: 1800 },
        { week_start: "2026-09-14", week_end: "2026-09-20", completed_workouts: 1, completed_sets: 4, planned_sets: 5, volume_kg: 900 },
      ],
      [
        { date: "2026-09-07", sleep_minutes: 480, sources: {} },
        { date: "2026-09-08", sleep_minutes: null, sources: {} },
        { date: "2026-09-13", sleep_minutes: 360, sources: {} },
        { date: "2026-09-14", sleep_minutes: 420, sources: {} },
      ],
    );
    expect(rows).toEqual([
      { weekStart: "2026-09-07", volumeKg: 1800, sleepMinutes: 420, sleepDays: 2 },
      { weekStart: "2026-09-14", volumeKg: 900, sleepMinutes: 420, sleepDays: 1 },
    ]);
  });

  it("does not turn an unrecorded week into zero sleep", () => {
    const rows = pairWeeklyLoadAndSleep(
      [{ week_start: "2026-09-07", week_end: "2026-09-13", completed_workouts: 0, completed_sets: 0, planned_sets: 0, volume_kg: 0 }],
      [],
    );
    expect(rows[0]?.sleepMinutes).toBeNull();
    expect(rows[0]?.sleepDays).toBe(0);
  });
});
