import { describe, expect, it } from "vitest";

import type { WorkoutScheduleOverview } from "@/api/workouts";
import {
  assignmentTargetRange,
  canStartProgramFromSchedule,
  plannedWorkoutOccurrence,
  startableWorkoutOccurrence,
} from "@/utils/workoutSchedule";

function occurrence(
  status: "scheduled" | "moved" | "missed" | "completed" | "cancelled" | "paused",
  dayIndex: number,
) {
  return {
    original_date: "2026-08-26",
    target_date: "2026-08-26",
    start_time: "06:15:00",
    title: `День ${dayIndex}`,
    program_id: null,
    day_index: dayIndex,
    status,
    is_override: false,
    is_assignment: false,
    can_reschedule: true,
    reschedule_until: null,
    can_cancel: status === "scheduled" || status === "missed",
    cancel_to: null,
  } as const;
}

describe("program schedule actions", () => {
  it("shows the next day without allowing an early start on a rest day", () => {
    const overview: WorkoutScheduleOverview = {
      requested_date: "2026-08-25",
      current: null,
      next: occurrence("scheduled", 4),
    };

    expect(startableWorkoutOccurrence(overview)).toBeNull();
    expect(plannedWorkoutOccurrence(overview)?.day_index).toBe(4);
    expect(canStartProgramFromSchedule(overview)).toBe(false);
  });

  it("allows a scheduled or missed occurrence to start", () => {
    for (const status of ["scheduled", "missed"] as const) {
      const current = occurrence(status, 4);
      const overview: WorkoutScheduleOverview = {
        requested_date: "2026-08-26",
        current,
        next: current,
      };
      expect(startableWorkoutOccurrence(overview)).toBe(current);
      expect(canStartProgramFromSchedule(overview)).toBe(true);
    }
  });

  it("uses the next occurrence after completion", () => {
    const overview: WorkoutScheduleOverview = {
      requested_date: "2026-08-24",
      current: occurrence("completed", 3),
      next: occurrence("scheduled", 4),
    };

    expect(plannedWorkoutOccurrence(overview)?.day_index).toBe(4);
    expect(canStartProgramFromSchedule(overview)).toBe(false);
  });

  it("keeps a cancelled day blocked and exposes the same program day next", () => {
    const cancelled = occurrence("cancelled", 3);
    const next = {
      ...occurrence("scheduled", 3),
      original_date: "2026-08-31",
      target_date: "2026-08-31",
    };
    const overview: WorkoutScheduleOverview = {
      requested_date: "2026-08-28",
      current: cancelled,
      next,
    };

    expect(startableWorkoutOccurrence(overview)).toBeNull();
    expect(plannedWorkoutOccurrence(overview)).toBe(next);
    expect(canStartProgramFromSchedule(overview)).toBe(false);
    expect(assignmentTargetRange(overview)).toMatchObject({
      min: "2026-08-28",
      max: "2026-08-30",
      source: next,
    });
  });

  it("does not start a program while today's workout is paused by illness", () => {
    const paused = occurrence("paused", 2);
    const overview = { requested_date: "2026-09-21", current: paused, next: null };

    expect(startableWorkoutOccurrence(overview)).toBeNull();
    expect(canStartProgramFromSchedule(overview)).toBe(false);
  });

  it("offers only days after a completed workout and before the next one", () => {
    const overview: WorkoutScheduleOverview = {
      requested_date: "2026-08-24",
      current: occurrence("completed", 3),
      next: {
        ...occurrence("scheduled", 4),
        original_date: "2026-08-26",
        target_date: "2026-08-26",
      },
    };

    expect(assignmentTargetRange(overview)).toMatchObject({
      min: "2026-08-25",
      max: "2026-08-25",
    });
  });
});
