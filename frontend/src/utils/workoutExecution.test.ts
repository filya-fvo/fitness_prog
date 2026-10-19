import { describe, expect, it } from "vitest";
import type { WorkoutPlan, WorkoutPlanExercise, WorkoutSetMethod } from "@/types/workout";
import { buildExecutionTimingPreview, buildExecutionSteps, resolveExecutionTransition, type TransitionInput } from "./workoutExecution";

const ex = (id: string, sets = 1, rest = 120): WorkoutPlanExercise => ({ exercise_id: id, order: 1, target_sets: sets, rest_sec: rest });
const method = (kind: "drop" | "cluster"): WorkoutSetMethod => ({ set_number: 1, kind, parts: [0, 1, 2].map(i => ({
  target_reps: 4, target_weight: kind === "cluster" ? 100 : 30 - i * 5, pause_after_sec: i < 2 && kind === "cluster" ? 20 : 0,
})) });
const plan = (exercises: WorkoutPlanExercise[], groups: WorkoutPlan["groups"] = []): WorkoutPlan => ({ execution_version: 2,
  exercises: exercises.map((row, i) => ({ ...row, order: i + 1 })), groups });
const group = (ids: string[], rounds = 2, kind: "superset" | "triset" | "circuit" = "superset") => ({
  id: "group", kind, exercise_ids: ids, rounds, transition_sec: 0, round_rest_sec: 90,
});
function input(p: WorkoutPlan, index = 0): TransitionInput {
  const steps = buildExecutionSteps(p);
  return { plan: p, facts: Object.fromEntries(steps.slice(0, index).map(step => [step.id, "completed"])),
    cursor: steps[index].id, stepId: steps[index].id, action: "complete", actionId: `action-${index}`,
    confirmedAt: { wallMs: 1000, monotonicMs: 1000, processId: "process" },
    owner: "owner", clientWorkoutId: "workout", rest: null,
  };
}
const pauses = (p: WorkoutPlan) => buildExecutionSteps(p).map((_, i) => resolveExecutionTransition(input(p, i)).durationSec);

describe("workout sequence and one contextual pause", () => {
  it.each([
    ["cluster before another full set", plan([{ ...ex("A", 2), set_methods: [method("cluster")] }]), [20, 20, 120, 0]],
    ["cluster at workout end", plan([{ ...ex("A"), set_methods: [method("cluster")] }]), [20, 20, 0]],
    ["drop transitions", plan([{ ...ex("A", 2), set_methods: [method("drop")] }]), [0, 0, 120, 0]],
    ["ordinary sets and next block", plan([ex("A", 2), ex("B")]), [120, 120, 0]],
    ["explicit zero rest", plan([ex("A", 2, 0)]), [0, 0]],
    ["superset", plan([ex("A", 2), ex("B", 2)], [group(["A", "B"])]), [0, 90, 0, 0]],
    ["group then next block", plan([ex("A", 2), ex("B", 2), ex("C")], [group(["A", "B"])]), [0, 90, 0, 90, 0]],
    ["triset", plan([ex("A", 2), ex("B", 2), ex("C", 2)], [group(["A", "B", "C"], 2, "triset")]), [0, 0, 90, 0, 0, 0]],
    ["circuit including timed work", plan([ex("A", 2), { ...ex("plank", 2), target_reps: "45 с" }], [group(["A", "plank"], 2, "circuit")]), [0, 90, 0, 0]],
    ["cluster inside superset", plan([{ ...ex("A", 2), set_methods: [method("cluster")] }, ex("B", 2)], [group(["A", "B"])]), [20, 20, 0, 90, 0, 0]],
  ])("%s", (_name, p, expected) => expect(pauses(p)).toEqual(expected));

  it("orders groups by round, keeping all compound parts together", () => {
    const p = plan([ex("A", 2), ex("B", 2)], [group(["A", "B"])]);
    expect(buildExecutionSteps(p).map(step => `${step.exerciseId}${step.setNumber}`)).toEqual(["A1", "B1", "A2", "B2"]);
  });

  it("uses only the group transition after the last cluster part", () => {
    const p = plan([{ ...ex("A", 2), set_methods: [method("cluster")] }, ex("B", 2)], [{ ...group(["A", "B"]), transition_sec: 7 }]);
    const result = resolveExecutionTransition(input(p, 2));
    expect(result).toMatchObject({ restKind: "group_transition", durationSec: 7, nextStep: { exerciseId: "B", round: 1 } });
  });

  it("does not change timing when auto-navigation is disabled", () => {
    const p = plan([ex("A", 2)]);
    expect(resolveExecutionTransition({ ...input(p), autoAdvance: false })).toEqual(resolveExecutionTransition({ ...input(p), autoAdvance: true }));
  });

  it("makes the last step terminal without completing the workout", () => {
    const result = resolveExecutionTransition(input(plan([ex("A")])));
    expect(result).toMatchObject({ terminal: true, durationSec: 0, nextStep: null, rest: null });
    expect(result).not.toHaveProperty("workoutCompleted");
  });

  it("skip advances with no pause and does not turn skipped parts into volume", () => {
    const p = plan([{ ...ex("A"), set_methods: [method("cluster")] }]);
    const result = resolveExecutionTransition({ ...input(p), action: "skip" });
    expect(result.durationSec).toBe(0);
    expect(result.rest).toBeNull();
    expect(result.facts[input(p).stepId]).toBe("skipped");
    expect(result.nextStep?.partOrdinal).toBe(2);
  });

  it("repeat action id, rerender, old correction and active rest cannot start another pause", () => {
    const p = plan([ex("A", 3)]);
    const first = resolveExecutionTransition(input(p));
    const next = { ...input(p, 1), ...first, plan: p, action: "complete" as const,
      actionId: "new", stepId: buildExecutionSteps(p)[1].id, confirmedAt: { wallMs: 2000, monotonicMs: 2000, processId: "process" } };
    const blocked = resolveExecutionTransition(next);
    expect(blocked.accepted).toBe(false);
    expect(blocked.rest).toEqual(first.rest);
    expect(blocked.facts[next.stepId]).toBeUndefined();
    const repeat = resolveExecutionTransition({ ...next, actionId: "action-0" });
    expect(repeat.accepted).toBe(false);
    expect(repeat.rest).toEqual(first.rest);
    const correction = resolveExecutionTransition({ ...next, action: "correct", stepId: buildExecutionSteps(p)[0].id });
    expect(correction.rest).toEqual(first.rest);
    expect(correction.cursor).toBe(first.cursor);
  });

  it("undo only cancels its own current transition and restores the logical step", () => {
    const p = plan([ex("A", 3)]);
    const first = resolveExecutionTransition(input(p));
    const undo = resolveExecutionTransition({ ...input(p), ...first, plan: p, action: "undo", actionId: "undo", undoActionId: "action-0", stepId: input(p).stepId });
    expect(undo.rest).toBeNull();
    expect(undo.cursor).toBe(input(p).cursor);
    expect(undo.facts[input(p).stepId]).toBe("pending");
    const second = resolveExecutionTransition({ ...input(p, 1), ...first, plan: p, stepId: buildExecutionSteps(p)[1].id,
      action: "complete", actionId: "action-1", rest: null });
    const tooLate = resolveExecutionTransition({ ...input(p), ...second, plan: p, action: "undo", actionId: "late-undo", undoActionId: "action-0", stepId: input(p).stepId });
    expect(tooLate.accepted).toBe(false);
    expect(tooLate.rest).toEqual(second.rest);
  });

  it("rejects missing members, nested/overlapping groups and unequal rounds", () => {
    const p = plan([ex("A", 2), ex("B", 3)], [group(["A", "B"])]);
    expect(() => buildExecutionSteps(p)).toThrow();
    expect(() => buildExecutionSteps(plan([ex("A", 2)], [group(["A", "missing"])]))).toThrow();
    expect(() => buildExecutionSteps(plan([ex("A", 2), ex("B", 2)], [group(["A", "B"]), { ...group(["A", "B"]), id: "overlap" }]))).toThrow();
  });
});

it("skips the unfinished remainder of a participant, retaining completed parts, and undoes only that skip", () => {
  const p = plan([{ ...ex("A", 2), set_methods: [method("cluster")] }, ex("B", 2)], [group(["A", "B"])]);
  const state = input(p, 1);
  const skipped = resolveExecutionTransition({ ...state, action: "skip_participant" });
  const steps = buildExecutionSteps(p);
  expect(skipped.facts[steps[0].id]).toBe("completed");
  expect(skipped.facts[steps[1].id]).toBe("skipped");
  expect(skipped.facts[steps[2].id]).toBe("skipped");
  expect(skipped.nextStep?.exerciseId).toBe("B");
  expect(skipped.rest).toBeNull();
  expect(skipped.manualContinue).toBe(true);
  const undo = resolveExecutionTransition({ ...state, ...skipped, plan: p, stepId: state.stepId, action: "undo", actionId: "undo-skip", undoActionId: state.actionId });
  expect(undo.facts[steps[0].id]).toBe("completed");
  expect(undo.facts[steps[1].id]).toBe("pending");
  expect(undo.facts[steps[2].id]).toBe("pending");
});

it("a stale undo button cannot undo a newer completion of the same logical step", () => {
  const p = plan([ex("A", 2)]);
  const first = resolveExecutionTransition(input(p));
  const undone = resolveExecutionTransition({ ...input(p), ...first, plan: p, action: "undo", actionId: "undo-first",
    stepId: input(p).stepId, undoActionId: "action-0" });
  const redo = resolveExecutionTransition({ ...input(p), ...undone, plan: p, action: "complete", actionId: "redo", stepId: input(p).stepId });
  const stale = resolveExecutionTransition({ ...input(p), ...redo, plan: p, action: "undo", actionId: "stale-undo",
    stepId: input(p).stepId, undoActionId: "action-0" });
  expect(stale.accepted).toBe(false);
  expect(stale.facts[input(p).stepId]).toBe("completed");
  expect(stale.rest?.sourceActionId).toBe("redo");
});

it("previews the same pauses as runtime without building a second timing rule", () => {
  const p = plan([{ ...ex("A", 2), set_methods: [method("cluster")] }, ex("B", 2)], [group(["A", "B"])]);
  expect(buildExecutionTimingPreview(p).map(row => row.durationSec)).toEqual(pauses(p));
});
