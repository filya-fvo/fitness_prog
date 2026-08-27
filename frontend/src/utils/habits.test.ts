import { beforeEach, describe, expect, it } from "vitest";

import {
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
      checkedIn: true,
    });

    clearWaterHistory();

    expect(getHabitDay("2026-08-10")).toMatchObject({
      waterMl: 0,
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
});
