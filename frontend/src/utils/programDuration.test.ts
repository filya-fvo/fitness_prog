import { describe, expect, it } from "vitest";

import { programDurationLabel, programDurationRange } from "@/utils/programDuration";

describe("program duration", () => {
  it("uses the configured user-facing range", () => {
    const program = { structure: { session_duration_min: 45, session_duration_max: 60 } };

    expect(programDurationRange(program)).toEqual({ min: 45, max: 60 });
    expect(programDurationLabel(program)).toBe("обычно 45–60 мин");
  });

  it("keeps older programs useful when only the minimum is stored", () => {
    expect(programDurationRange({ structure: { session_duration_min: "70" } })).toEqual({
      min: 70,
      max: 85,
    });
  });

  it("does not show an invented duration without source data", () => {
    expect(programDurationLabel({ structure: {} })).toBeNull();
    expect(programDurationLabel({ structure: { session_duration_min: 0 } })).toBeNull();
  });
});
