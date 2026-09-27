import { describe, expect, it } from "vitest";

import { buildWellnessChart } from "@/utils/wellnessChart";

describe("buildWellnessChart", () => {
  it("connects observed values and marks a connection across missing days", () => {
    const chart = buildWellnessChart(
      [1000, null, undefined, 4000, 5000],
      (index) => index * 10,
      (value) => value / 1000,
    );

    expect(chart.points.map((point) => point.index)).toEqual([0, 3, 4]);
    expect(chart.connections).toHaveLength(2);
    expect(chart.connections[0]?.crossesMissingDays).toBe(true);
    expect(chart.connections[1]?.crossesMissingDays).toBe(false);
  });

  it("keeps missing series empty while preserving a recorded zero", () => {
    const missing = buildWellnessChart([null, undefined, Number.NaN], (index) => index, (value) => value);
    expect(missing).toEqual({ points: [], connections: [] });

    const recordedZero = buildWellnessChart([null, 0], (index) => index, (value) => value);
    expect(recordedZero.points).toEqual([{ index: 1, x: 1, y: 0, value: 0 }]);
  });
});
