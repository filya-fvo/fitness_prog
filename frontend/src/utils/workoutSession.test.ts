import { describe, expect, it } from "vitest";

import type { Workout } from "@/types/workout";
import {
  draftsFromWorkoutSnapshot,
  findNextIncompleteExerciseIndex,
  isPlannedExerciseComplete,
  resolveAutoAdvanceSetting,
  shouldStartRestAfterSet,
} from "@/utils/workoutSession";

function workoutFixture(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "workout-1",
    user_id: "user-1",
    program_id: null,
    scheduled_date: "2026-08-10",
    status: "planned",
    ai_notes: null,
    rpe: null,
    started_at: "2026-08-10T10:00:00Z",
    completed_at: null,
    title: "Тестовая тренировка",
    workout_type: "custom",
    plan: {
      exercises: [
        {
          exercise_id: "exercise-1",
          order: 1,
          target_sets: 3,
          target_reps: "10",
          rest_sec: 90,
        },
      ],
    },
    sets: [],
    ...overrides,
  };
}

describe("draftsFromWorkoutSnapshot", () => {
  it("creates planned slots when the server has no logged sets", () => {
    const drafts = draftsFromWorkoutSnapshot(workoutFixture());

    expect(drafts).toHaveLength(3);
    expect(drafts.map((row) => row.setNumber)).toEqual([1, 2, 3]);
    expect(drafts.every((row) => row.restTimeSec === 90)).toBe(true);
    expect(drafts.every((row) => !row.isCompleted)).toBe(true);
  });

  it("merges completed server sets with remaining plan slots", () => {
    const workout = workoutFixture({
      sets: [
        {
          id: "set-1",
          workout_id: "workout-1",
          exercise_id: "exercise-1",
          set_number: 1,
          reps: 12,
          weight: 42.5,
          is_completed: true,
          rest_time_sec: 75,
          duration_sec: null,
          note: "чисто",
          machine_params: null,
        },
      ],
    });

    const drafts = draftsFromWorkoutSnapshot(workout);

    expect(drafts).toHaveLength(3);
    expect(drafts[0]).toMatchObject({
      exerciseId: "exercise-1",
      setNumber: 1,
      reps: "12",
      weight: "42.5",
      isCompleted: true,
      restTimeSec: 75,
      note: "чисто",
    });
    expect(drafts[1]?.isCompleted).toBe(false);
  });

  it("keeps legacy sets that are absent from the plan snapshot", () => {
    const workout = workoutFixture({
      plan: { exercises: [] },
      sets: [
        {
          id: "set-legacy",
          workout_id: "workout-1",
          exercise_id: "legacy-exercise",
          set_number: 2,
          reps: 8,
          weight: 30,
          is_completed: false,
          rest_time_sec: null,
        },
      ],
    });

    expect(draftsFromWorkoutSnapshot(workout)).toEqual([
      expect.objectContaining({
        exerciseId: "legacy-exercise",
        setNumber: 2,
        reps: "8",
        weight: "30",
        restTimeSec: 60,
      }),
    ]);
  });
});

describe("active workout completion rules", () => {
  const drafts = [
    { exerciseId: "exercise-1", setNumber: 1, reps: "10", weight: "40", isCompleted: true, restTimeSec: 90 },
    { exerciseId: "exercise-1", setNumber: 2, reps: "10", weight: "40", isCompleted: true, restTimeSec: 90 },
    { exerciseId: "exercise-1", setNumber: 3, reps: "10", weight: "40", isCompleted: true, restTimeSec: 90 },
    { exerciseId: "exercise-1", setNumber: 4, reps: "", weight: "", isCompleted: false, restTimeSec: 90 },
  ];

  it("does not let an extra unfinished set block completion of planned sets", () => {
    expect(isPlannedExerciseComplete(drafts, "exercise-1", 3)).toBe(true);
  });

  it("requires every planned slot to be completed", () => {
    expect(
      isPlannedExerciseComplete(
        drafts.map((draft) => draft.setNumber === 2 ? { ...draft, isCompleted: false } : draft),
        "exercise-1",
        3,
      ),
    ).toBe(false);
  });

  it("does not restart a timer that was active when a set was submitted", () => {
    expect(
      shouldStartRestAfterSet({
        setWasCompleted: false,
        restWasActiveAtSubmit: true,
        restIsActiveNow: false,
      }),
    ).toBe(false);
    expect(
      shouldStartRestAfterSet({
        setWasCompleted: false,
        restWasActiveAtSubmit: false,
        restIsActiveNow: false,
      }),
    ).toBe(true);
  });

  it("keeps auto-advance enabled for profiles saved before the preference existed", () => {
    expect(resolveAutoAdvanceSetting(undefined)).toBe(true);
    expect(resolveAutoAdvanceSetting(null)).toBe(true);
    expect(resolveAutoAdvanceSetting(false)).toBe(false);
    expect(resolveAutoAdvanceSetting("0")).toBe(false);
  });

  it("selects the next unfinished exercise for auto-advance", () => {
    const rows = [
      ...drafts,
      { exerciseId: "exercise-2", setNumber: 1, reps: "10", weight: "20", isCompleted: true, restTimeSec: 60 },
      { exerciseId: "exercise-3", setNumber: 1, reps: "10", weight: "20", isCompleted: false, restTimeSec: 60 },
    ];
    const next = findNextIncompleteExerciseIndex(
      ["exercise-1", "exercise-2", "exercise-3"],
      rows,
      0,
      [
        { exercise_id: "exercise-1", target_sets: 3 },
        { exercise_id: "exercise-2", target_sets: 1 },
        { exercise_id: "exercise-3", target_sets: 1 },
      ],
    );
    expect(next).toBe(2);
  });
});
