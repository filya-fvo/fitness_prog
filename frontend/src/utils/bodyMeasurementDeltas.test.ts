import { describe, expect, it } from "vitest";

import type { BodyMeasurement } from "@/api/bodyMeasurements";

import {
  latestMeasurementComparison,
  previousMeasurementPoint,
} from "./bodyMeasurementDeltas";

const items: BodyMeasurement[] = [
  { date: "2026-08-01", chest_cm: 100, waist_cm: 84, sources: {} },
  { date: "2026-08-10", waist_cm: 82, sources: {} },
  { date: "2026-08-20", chest_cm: 98, sources: {} },
];

describe("body measurement comparisons", () => {
  it("compares each field with its own previous non-null value", () => {
    expect(latestMeasurementComparison(items, "chest_cm")).toEqual({
      current: { date: "2026-08-20", value: 98 },
      previous: { date: "2026-08-01", value: 100 },
      delta: -2,
      days: 19,
    });
    expect(latestMeasurementComparison(items, "waist_cm")?.days).toBe(9);
  });

  it("finds a previous field value before an edited date", () => {
    expect(previousMeasurementPoint(items, "chest_cm", "2026-08-15")).toEqual({
      date: "2026-08-01",
      value: 100,
    });
  });
});
