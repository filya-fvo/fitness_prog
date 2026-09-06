import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import { cancelScheduledWorkout, fetchPersonalRegularity } from "./workouts";

describe("workout schedule API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("cancels one occurrence and parses the following program day", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValue({
      data: {
        requested_date: "2026-08-28",
        current: {
          original_date: "2026-08-28",
          target_date: "2026-08-28",
          start_time: "18:30:00",
          title: "Грудь и спина",
          program_id: "33333333-3333-4333-8333-333333333333",
          day_index: 3,
          status: "cancelled",
          is_override: true,
          can_reschedule: false,
          can_cancel: false,
          cancel_to: null,
        },
        next: {
          original_date: "2026-08-31",
          target_date: "2026-08-31",
          start_time: "18:30:00",
          title: "Грудь и спина",
          program_id: "33333333-3333-4333-8333-333333333333",
          day_index: 3,
          status: "scheduled",
          is_override: false,
          can_reschedule: true,
          can_cancel: true,
          cancel_to: "2026-09-02",
        },
      },
    });

    const result = await cancelScheduledWorkout("2026-08-28");

    expect(apiClient.post).toHaveBeenCalledWith("/workouts/schedule/cancel", {
      scheduled_date: "2026-08-28",
    });
    expect(result.current?.status).toBe("cancelled");
    expect(result.next).toMatchObject({ target_date: "2026-08-31", day_index: 3 });
  });

  it("parses personal plan regularity", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({
      data: {
        period_start: "2026-08-10",
        period_end: "2026-09-06",
        has_schedule: true,
        completed: 10,
        planned: 12,
        rescheduled_completed: 1,
        cancelled: 1,
        missed: 1,
        completion_pct: 83.3,
      },
    });

    const result = await fetchPersonalRegularity();

    expect(apiClient.get).toHaveBeenCalledWith("/workouts/regularity", { params: { days: 28 } });
    expect(result).toMatchObject({ completed: 10, planned: 12, completion_pct: 83.3 });
  });
});
