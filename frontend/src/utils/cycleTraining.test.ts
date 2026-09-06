import { describe, expect, it } from "vitest";

import {
  cycleTrainingEnabledForProfile,
  isCycleReadiness,
  phaseFromPlan,
} from "@/utils/cycleTraining";

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

  it("offers the check only to opted-in female or unspecified profiles", () => {
    expect(cycleTrainingEnabledForProfile({ cycle_training_enabled: true }, "female")).toBe(true);
    expect(cycleTrainingEnabledForProfile({ cycle_training_enabled: true }, "")).toBe(true);
    expect(cycleTrainingEnabledForProfile({ cycle_training_enabled: true }, "male")).toBe(false);
    expect(cycleTrainingEnabledForProfile({ cycle_training_enabled: true }, "other")).toBe(false);
    expect(cycleTrainingEnabledForProfile({ cycle_training_enabled: false }, "female")).toBe(false);
  });
});
