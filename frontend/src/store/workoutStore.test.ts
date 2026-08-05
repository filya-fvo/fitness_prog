import { beforeEach, describe, expect, it } from "vitest";

import { useWorkoutStore } from "@/store/workoutStore";

describe("workoutStore", () => {
  beforeEach(() => {
    useWorkoutStore.getState().resetSession();
    useWorkoutStore.getState().setCatalog([]);
  });

  it("adds and renumbers draft sets", () => {
    const store = useWorkoutStore.getState();
    store.setDrafts([
      {
        exerciseId: "e1",
        setNumber: 1,
        reps: "10",
        weight: "50",
        isCompleted: false,
        restTimeSec: 60,
      },
    ]);
    store.addDraftSet("e1");
    const drafts = useWorkoutStore.getState().drafts;
    expect(drafts).toHaveLength(2);
    expect(drafts[1]?.setNumber).toBe(2);
    expect(drafts[1]?.weight).toBe("50");
  });

  it("navigates multi-exercise queue", () => {
    const store = useWorkoutStore.getState();
    store.setDrafts([
      {
        exerciseId: "e1",
        setNumber: 1,
        reps: "",
        weight: "",
        isCompleted: false,
        restTimeSec: 60,
      },
      {
        exerciseId: "e2",
        setNumber: 1,
        reps: "",
        weight: "",
        isCompleted: false,
        restTimeSec: 60,
      },
      {
        exerciseId: "e3",
        setNumber: 1,
        reps: "",
        weight: "",
        isCompleted: false,
        restTimeSec: 60,
      },
    ]);
    expect(useWorkoutStore.getState().currentExerciseIndex).toBe(0);
    store.nextExercise();
    expect(useWorkoutStore.getState().currentExerciseIndex).toBe(1);
    store.nextExercise();
    store.nextExercise();
    expect(useWorkoutStore.getState().currentExerciseIndex).toBe(2);
    store.prevExercise();
    expect(useWorkoutStore.getState().currentExerciseIndex).toBe(1);
  });

  it("navigates from plan when drafts are empty", () => {
    const store = useWorkoutStore.getState();
    store.setActiveWorkout({
      id: "w1",
      user_id: "u1",
      program_id: null,
      scheduled_date: "2026-08-03",
      status: "planned",
      ai_notes: null,
      rpe: null,
      started_at: new Date().toISOString(),
      completed_at: null,
      title: "Test",
      workout_type: null,
      plan: {
        exercises: [
          { exercise_id: "e1", order: 1, target_sets: 3, target_reps: "8-10", rest_sec: 60 },
          { exercise_id: "e2", order: 2, target_sets: 3, target_reps: "8-10", rest_sec: 60 },
          { exercise_id: "e3", order: 3, target_sets: 3, target_reps: "8-10", rest_sec: 60 },
        ],
      },
      duration_sec: null,
      sets: [],
    } as never);
    store.setDrafts([]);
    expect(useWorkoutStore.getState().currentExerciseIndex).toBe(0);
    store.nextExercise();
    expect(useWorkoutStore.getState().currentExerciseIndex).toBe(1);
    store.setCurrentExerciseIndex(2);
    expect(useWorkoutStore.getState().currentExerciseIndex).toBe(2);
    store.prevExercise();
    expect(useWorkoutStore.getState().currentExerciseIndex).toBe(1);
  });


  it("replaces exercise and restores defaults", () => {
    const store = useWorkoutStore.getState();
    store.setCatalog([
      {
        id: "e1",
        name_ru: "Жим",
        muscle_group: "грудь",
        equipment: "штанга",
        description: null,
        technique: null,
        common_mistakes: null,
        difficulty: 2,
        video_url: null,
        animation_url: null,
        thumbnail_url: null,
        media_duration_sec: null,
        media_source: "none",
        tags: [],
      },
      {
        id: "e2",
        name_ru: "Разведения",
        muscle_group: "грудь",
        equipment: "гантели",
        description: null,
        technique: null,
        common_mistakes: null,
        difficulty: 1,
        video_url: null,
        animation_url: null,
        thumbnail_url: null,
        media_duration_sec: null,
        media_source: "none",
        tags: [],
      },
    ]);
    store.hydrateSession({
      clientId: "c1",
      serverId: null,
      workout: {
        id: "c1",
        user_id: "u1",
        program_id: "p1",
        scheduled_date: "2026-07-22",
        status: "planned",
        ai_notes: null,
        rpe: null,
        started_at: null,
        completed_at: null,
        sets: [],
        plan: {
          title: "День 1",
          exercises: [
            {
              exercise_id: "e1",
              order: 1,
              target_sets: 3,
              target_reps: "10",
              name_ru: "Жим",
            },
          ],
        },
      },
      drafts: [
        {
          exerciseId: "e1",
          setNumber: 1,
          reps: "10",
          weight: "40",
          isCompleted: false,
          restTimeSec: 90,
        },
      ],
    });

    const ok = useWorkoutStore.getState().replaceExercise("e1", {
      id: "e2",
      name_ru: "Разведения",
      muscle_group: "грудь",
      equipment: "гантели",
      description: null,
      technique: null,
      common_mistakes: null,
      difficulty: 1,
      video_url: null,
      animation_url: null,
      thumbnail_url: null,
      media_duration_sec: null,
      media_source: "none",
      tags: [],
    });
    expect(ok).toBe(true);
    let next = useWorkoutStore.getState();
    expect(next.drafts[0]?.exerciseId).toBe("e2");
    expect(next.drafts[0]?.weight).toBe("40");
    const planEx = (
      next.activeWorkout?.plan as {
        exercises: Array<{ exercise_id: string; original_exercise_id?: string }>;
      }
    ).exercises[0];
    expect(planEx?.exercise_id).toBe("e2");
    expect(planEx?.original_exercise_id).toBe("e1");

    const restored = useWorkoutStore.getState().restoreDefaultExercises();
    expect(restored).toBe(true);
    next = useWorkoutStore.getState();
    expect(next.drafts[0]?.exerciseId).toBe("e1");
    const planEx2 = (
      next.activeWorkout?.plan as {
        exercises: Array<{ exercise_id: string; original_exercise_id?: string | null }>;
      }
    ).exercises[0];
    expect(planEx2?.exercise_id).toBe("e1");
    expect(planEx2?.original_exercise_id).toBeFalsy();
  });

  it("remaps client workout id to server id", () => {
    const store = useWorkoutStore.getState();
    store.hydrateSession({
      clientId: "client-1",
      serverId: null,
      workout: {
        id: "client-1",
        user_id: "u1",
        program_id: null,
        scheduled_date: "2026-07-22",
        status: "planned",
        ai_notes: null,
        rpe: null,
        started_at: null,
        completed_at: null,
        sets: [],
      },
      drafts: [],
    });
    store.remapWorkoutId("server-9");
    const next = useWorkoutStore.getState();
    expect(next.clientWorkoutId).toBe("client-1");
    expect(next.serverWorkoutId).toBe("server-9");
    expect(next.activeWorkout?.id).toBe("server-9");
  });
});
