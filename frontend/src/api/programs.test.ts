import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import { createMyProgram, fetchPrograms, startProgramWorkout, type PersonalProgramInput } from "./programs";

describe("program catalog API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("serializes personal targets, groups and methods atomically and preserves server JSON weights", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    const exerciseId = "00000000-0000-4000-8000-000000000001";
    const secondId = "00000000-0000-4000-8000-000000000002";
    const input: PersonalProgramInput = {
      name: "Моя программа", location: "gym", progression: "phased", duration_weeks: 8,
      days: [{ name: "Верх", groups: [{ id: "00000000-0000-4000-8000-000000000003",
        kind: "superset", exercise_ids: [exerciseId, secondId], rounds: 3, transition_sec: 0, round_rest_sec: 0 }],
      exercises: [{ exercise_id: exerciseId, sets: 3, reps: "6-8", rest_sec: 0, weight_mode: "per_hand",
        target: { kind: "weight_reps", reps_min: 6, reps_max: 8, target_weight: 40 },
        set_methods: [{ set_number: 3, kind: "drop", parts: [
          { target_reps: 6, target_weight: 40, pause_after_sec: 0 },
          { target_reps: 4, target_weight: 30, pause_after_sec: 0 },
        ] }],
      }, { exercise_id: secondId, sets: 3, reps: "8", rest_sec: 60 }] }],
    };
    const structure = { schedule: [{ groups: input.days[0].groups, exercises: [{
      ...input.days[0].exercises[0],
      target: { kind: "weight_reps", reps_min: 6, reps_max: 8, target_weight: "40.00" },
      set_methods: [{ set_number: 3, kind: "drop", parts: [
        { target_reps: 6, target_weight: "40.00", pause_after_sec: 0 },
        { target_reps: 4, target_weight: "30.00", pause_after_sec: 0 },
      ] }],
    }] }] };
    const oldAdapter = apiClient.defaults.adapter;
    const requests: Array<{ url?: string; method?: string; body: unknown }> = [];
    apiClient.defaults.adapter = async (config) => {
      requests.push({ url: config.url, method: config.method, body: JSON.parse(config.data as string) });
      return { config, status: 201, statusText: "Created", headers: {}, data: {
        id: exerciseId, name: input.name, structure, owner_id: secondId, is_template: false,
      } };
    };
    try {
      const result = await createMyProgram(input);
      expect(requests).toEqual([{ url: "/programs/mine", method: "post", body: input }]);
      expect(result.structure).toEqual(structure);
      expect(result.is_template).toBe(false);
    } finally {
      apiClient.defaults.adapter = oldAdapter;
    }
  });

  it("continues accepting the old personal input without optional fields", async () => {
    const input: PersonalProgramInput = { name: "Старый план", location: "home", progression: "linear",
      duration_weeks: 8, days: [{ name: "День", exercises: [{
        exercise_id: "00000000-0000-4000-8000-000000000001", sets: 3, reps: "8", rest_sec: 60,
      }] }] };
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ data: {
      id: "00000000-0000-4000-8000-000000000002", name: input.name, structure: { schedule: input.days },
    } });
    expect((await createMyProgram(input)).structure).toEqual({ schedule: input.days });
    expect(post).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith("/programs/mine", input);
  });

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
            personal_duration_min: 68,
            personal_duration_sample_size: 4,
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
      personal_duration_min: 68,
      personal_duration_sample_size: 4,
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
      execution_version: 2,
      day_index: 2,
      scheduled_date: null,
      week_phase: "heavy",
      cycle_readiness: "reduce",
    });

    await startProgramWorkout({ programId: response.program_id });
    expect(post).toHaveBeenLastCalledWith(`/programs/${response.program_id}/start`, {
      execution_version: 2,
      day_index: 1,
      scheduled_date: null,
      week_phase: null,
    });
  });
});
