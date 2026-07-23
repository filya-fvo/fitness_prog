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
