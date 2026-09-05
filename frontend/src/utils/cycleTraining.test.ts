import { describe, expect, it } from "vitest";

import { isCycleReadiness, phaseFromPlan } from "@/utils/cycleTraining";

describe("cycle training helpers", () => {
  it("accepts only supported daily readiness values", () => {
    expect(isCycleReadiness("normal")).toBe(true);
    expect(isCycleReadiness("reduce")).toBe(true);
    expect(isCycleReadiness("unknown")).toBe(false);
    expect(isCycleReadiness(null)).toBe(false);
  });

  it("uses the server-adjusted phase and keeps a safe fallback", () => {
    expect(phaseFromPlan({ exercises: [], week_phase: "light" }, "heavy")).toBe("light");
    expect(phaseFromPlan({ exercises: [], week_phase: "other" }, "medium")).toBe("medium");
    expect(phaseFromPlan(null, "heavy")).toBe("heavy");
  });
});
