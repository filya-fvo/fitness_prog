import { beforeEach, describe, expect, it } from "vitest";

import {
  clearMeasurementHistory,
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
      weightKg: 82,
      sleepHours: 7.5,
      checkedIn: true,
    });

    clearWaterHistory();

    expect(getHabitDay("2026-08-10")).toMatchObject({
      waterMl: 0,
      weightKg: 82,
      sleepHours: 7.5,
    });
  });

  it("clears only local weight measurements", () => {
    saveHabitDay({
      date: "2026-08-10",
      waterMl: 1800,
      weightKg: 82,
      sleepHours: 7.5,
      checkedIn: true,
    });

    clearMeasurementHistory();

    expect(getHabitDay("2026-08-10")).toMatchObject({
      waterMl: 1800,
      weightKg: null,
      sleepHours: 7.5,
    });
  });
});
