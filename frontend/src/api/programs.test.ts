import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import { fetchPrograms, startProgramWorkout } from "./programs";

describe("program catalog API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("parses publication metadata returned by the safe public catalog", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({
      data: {
        items: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            name: "Программа",
            structure: {},
            publication_status: "published",
            program_key: "seed-program",
            version: 2,
            is_current: true,
            published_at: "2026-08-28T10:00:00Z",
          },
        ],
        total: 1,
      },
    });

    const result = await fetchPrograms();

    expect(apiClient.get).toHaveBeenCalledWith("/programs", {
      params: expect.objectContaining({ templates_only: true }),
    });
    expect(result.items[0]).toMatchObject({
      publication_status: "published",
      program_key: "seed-program",
      version: 2,
      is_current: true,
    });
  });

  it("sends the one-time readiness answer only when it was selected", async () => {
    const response = {
      id: "00000000-0000-4000-8000-000000000010",
      user_id: "00000000-0000-4000-8000-000000000011",
      program_id: "00000000-0000-4000-8000-000000000001",
      scheduled_date: "2026-09-06",
      status: "planned",
      plan: { exercises: [] },
      sets: [],
    };
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ data: response });

    await startProgramWorkout({
      programId: response.program_id,
      dayIndex: 2,
      weekPhase: "heavy",
      cycleReadiness: "reduce",
    });
    expect(post).toHaveBeenLastCalledWith(`/programs/${response.program_id}/start`, {
      day_index: 2,
      scheduled_date: null,
      week_phase: "heavy",
      cycle_readiness: "reduce",
    });

    await startProgramWorkout({ programId: response.program_id });
    expect(post).toHaveBeenLastCalledWith(`/programs/${response.program_id}/start`, {
      day_index: 1,
      scheduled_date: null,
      week_phase: null,
    });
  });
});
