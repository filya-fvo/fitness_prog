import { beforeEach, describe, expect, it } from "vitest";

import {
  addWater,
  adoptHabitHistory,
  clearLegacyWeightHistory,
  clearWaterHistory,
  getHabitDay,
  saveHabitDay,
} from "@/utils/habits";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

describe("habit history clearing", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: memoryStorage(),
      configurable: true,
    });
  });

  it("clears only water history", () => {
    saveHabitDay({
      date: "2026-08-10",
      waterMl: 1800,
      sleepHours: 7.5,
      cycleReadiness: "reduce",
      cycleReadinessPending: true,
      checkedIn: true,
    });

    clearWaterHistory();

    expect(getHabitDay("2026-08-10")).toMatchObject({
      waterMl: 0,
      cycleReadiness: "reduce",
      cycleReadinessPending: true,
      sleepHours: 7.5,
    });
  });

  it("removes a legacy daily weight without touching activity", () => {
    localStorage.setItem("fitness_habits_v1", JSON.stringify({
      "2026-08-10": {
        date: "2026-08-10", waterMl: 1800, weightKg: 82,
        sleepHours: 7.5, steps: 9000, activeMinutes: 40, checkedIn: true,
      },
    }));

    clearLegacyWeightHistory();

    expect(getHabitDay("2026-08-10")).toMatchObject({
      waterMl: 1800,
      sleepHours: 7.5,
      steps: 9000,
      activeMinutes: 40,
    });
    expect(localStorage.getItem("fitness_habits_v1")).not.toContain("weightKg");
  });

  it("keeps manual movement fields in the offline copy", () => {
    saveHabitDay({
      date: "2026-08-10",
      waterMl: 1000,
      sleepHours: 8,
      steps: 9500,
      activeMinutes: 55,
      checkedIn: true,
    });

    expect(getHabitDay("2026-08-10")).toMatchObject({
      steps: 9500,
      activeMinutes: 55,
    });
  });

  it("keeps water pending until the server acknowledges it", () => {
    const pending = addWater(250, "2026-08-10", "user-a");

    expect(pending).toMatchObject({ waterMl: 250, waterPending: true });
    expect(getHabitDay("2026-08-10", "user-a").waterPending).toBe(true);
  });

  it("isolates device caches for different accounts", () => {
    saveHabitDay({
      date: "2026-08-10",
      waterMl: 1250,
      sleepHours: 8,
      checkedIn: true,
    }, "user-a");

    expect(getHabitDay("2026-08-10", "user-a").waterMl).toBe(1250);
    expect(getHabitDay("2026-08-10", "user-b").waterMl).toBe(0);
  });

  it("moves the legacy cache once to the authenticated account", () => {
    saveHabitDay({
      date: "2026-08-10",
      waterMl: 900,
      sleepHours: 7,
      checkedIn: true,
    });

    expect(getHabitDay("2026-08-10", "user-a").waterMl).toBe(900);
    expect(localStorage.getItem("fitness_habits_v1")).toBeNull();
    expect(getHabitDay("2026-08-10", "user-b").waterMl).toBe(0);
  });

  it("moves an old account cache after account merge", () => {
    addWater(500, "2026-08-10", "old-user");

    adoptHabitHistory("old-user", "new-user");

    expect(getHabitDay("2026-08-10", "new-user")).toMatchObject({
      waterMl: 500,
      waterPending: true,
    });
    expect(getHabitDay("2026-08-10", "old-user").waterMl).toBe(0);
  });
});
