import { describe, expect, it } from "vitest";

import { programSelectionGoalsPatch } from "@/utils/programProgress";

describe("program selection schedule state", () => {
  it("starts a newly selected program today from day one", () => {
    expect(programSelectionGoalsPatch({
      active_program_id: "old-program",
      active_program_started_at: "2026-08-01",
      active_program_next_day: 4,
    }, "new-program", "2026-08-27")).toEqual({
      active_program_id: "new-program",
      active_program_started_at: "2026-08-27",
      active_program_next_day: 1,
      active_program_week_phase: "light",
      active_program_phase_source: "auto",
      active_program_workouts_in_phase: 0,
    });
  });

  it("does not reset progress when the active program did not change", () => {
    expect(programSelectionGoalsPatch({
      active_program_id: "same-program",
      active_program_started_at: "2026-08-01",
      active_program_next_day: 3,
    }, "same-program", "2026-08-27")).toEqual({
      active_program_id: "same-program",
    });
  });
});
