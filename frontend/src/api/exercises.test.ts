import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import { fetchExerciseExplorer, setExercisePinned, fetchExerciseCatalog } from "./exercises";

const exerciseId = "11111111-1111-4111-8111-111111111111";

describe("exercise explorer API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("maps a bounded recent exercise page", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: {
      items: [{
        id: exerciseId,
        name_ru: "Жим гантелей",
        muscle_group: "chest",
        difficulty: 2,
        is_pinned: true,
        last_completed_date: "2026-09-08",
        completed_workouts: 4,
      }],
      total: 1,
      page: 1,
      page_size: 20,
      muscle_groups: ["chest", "back"],
      pin_limit: 8,
    } });

    const result = await fetchExerciseExplorer({ scope: "recent", q: " жим " });

    expect(apiClient.get).toHaveBeenCalledWith("/exercises/explorer", { params: {
      page: 1,
      page_size: 20,
      scope: "recent",
      muscle_group: undefined,
      q: "жим",
    } });
    expect(result.items[0]).toMatchObject({
      id: exerciseId,
      isPinned: true,
      lastCompletedDate: "2026-09-08",
      completedWorkouts: 4,
    });
  });

  it("uses idempotent PUT and DELETE pin endpoints", async () => {
    const spy = vi.spyOn(apiClient, "put").mockResolvedValue({ data: {
      exercise_id: exerciseId,
      is_pinned: true,
      pinned_count: 1,
      pin_limit: 8,
    } });
    const pinned = await setExercisePinned(exerciseId, true);
    expect(spy).toHaveBeenCalledWith(`/exercises/${exerciseId}/pin`);
    expect(pinned).toMatchObject({ isPinned: true, pinnedCount: 1, pinLimit: 8 });

    vi.spyOn(apiClient, "delete").mockResolvedValue({ data: {
      exercise_id: exerciseId,
      is_pinned: false,
      pinned_count: 0,
      pin_limit: 8,
    } });
    expect((await setExercisePinned(exerciseId, false)).isPinned).toBe(false);
  });
});


describe("catalog for personal additions", () => {
  afterEach(() => vi.restoreAllMocks());
  it("includes an exercise from a later page instead of restricting additions to page one", async () => {
    const abs = "22222222-2222-4222-8222-222222222222";
    vi.spyOn(apiClient, "get")
      .mockResolvedValueOnce({ data: { items: [{ id: exerciseId, name_ru: "Сгибания", muscle_group: "biceps", difficulty: 1 }], total: 201, page: 1, page_size: 200 } })
      .mockResolvedValueOnce({ data: { items: [{ id: abs, name_ru: "Скручивания", muscle_group: "abs", difficulty: 1 }], total: 201, page: 2, page_size: 200 } });
    const rows = await fetchExerciseCatalog();
    expect(rows.map(row => row.name_ru)).toEqual(["Сгибания", "Скручивания"]);
  });
});
