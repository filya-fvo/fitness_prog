import { expect, it } from "vitest";
import type { Workout, WorkoutSet, LocalSetDraft } from "@/types/workout";
import { computeWorkoutVolume } from "./progress";
import { buildWorkoutCompletionFacts, buildInstantWorkoutMessage } from "./workoutCompletion";
import { historySetLoad, historySetOutcome } from "./workoutHistorySets";

function row(kind: "cluster" | "drop", partial = false, perHand = false): WorkoutSet {
  return { id: "set", workout_id: "workout", exercise_id: "exercise", set_number: 1, execution_kind: kind,
    reps: null, weight: null, is_completed: !partial, rest_time_sec: 120, weight_mode: perHand ? "per_hand" : "total",
    parts: [0, 1, 2].map(i => ({ id: String(i), ordinal: i + 1, reps: kind === "cluster" ? 4 : i === 0 ? 10 : 8,
      weight: kind === "cluster" ? 100 : 30 - i * 5, duration_sec: null,
      status: partial && i === 2 ? "pending" : "completed", rest_after_sec: i < 2 ? 20 : 0 })) };
}
for (const [kind, partial, perHand, expected] of [["cluster", false, false, 1200], ["drop", false, false, 660],
  ["cluster", true, false, 800], ["cluster", true, true, 1600]] as const) {
  it(`counts ${kind} partial=${partial} perHand=${perHand} as ${expected} in chart and completion`, () => {
    const set = row(kind, partial, perHand);
    const workout = { sets: [set] } as Workout;
    expect(computeWorkoutVolume(workout)).toBe(expected);
    const draft: LocalSetDraft = { exerciseId: set.exercise_id, setNumber: 1, executionKind: kind, parts: set.parts,
      isCompleted: set.is_completed, reps: "", weight: "", weightMode: set.weight_mode, restTimeSec: 120 };
    const facts = buildWorkoutCompletionFacts({ drafts: [draft], exerciseIds: [set.exercise_id], elapsedSec: 600, rpe: 7 });
    expect(facts.tonnageKg).toBe(expected);
    expect(facts.isPartial).toBe(partial);
    expect(facts).toMatchObject({ completedSets: partial ? 0 : 1, completedParts: partial ? 2 : 3, totalParts: 3 });
    expect(buildInstantWorkoutMessage(facts)).toContain(`частей ${partial ? 2 : 3}/3`);
  });
}
it("shows actual parts and never compares a compound to a continuous strength result", () => {
  const set = row("cluster", true);
  expect(historySetLoad(set)).toContain("Кластер");
  expect(historySetLoad(set)).toContain("ожидает");
  expect(historySetOutcome(set)).toBe("partial");
  const full = row("cluster");
  expect(historySetOutcome(full, { ...full, execution_kind: "standard", reps: 4, weight: 90 })).toBe("unknown");
});
import { buildExerciseDiary, buildExerciseProgress } from "./exerciseProgress";
it("local exercise diary retains partial parts while strength chart ignores even legacy flattened compounds", () => {
  const set = row("cluster", true);
  const workout = { id: "workout", status: "completed", scheduled_date: "2026-10-19", completed_at: null, sets: [set], plan: {} } as Workout;
  expect(buildExerciseDiary([workout], "exercise")[0]?.sets[0]).toMatchObject({ executionKind: "cluster", parts: set.parts });
  expect(buildExerciseProgress([{ ...workout, sets: [{ ...set, is_completed: true, weight: 100, reps: 12 }] }], "exercise")).toEqual([]);
});
