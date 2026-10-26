import { expect, it } from "vitest";
import { migrateProgramNumbers } from "./programNumbers";

it("normalizes external Decimal method and target weights without dropping groups, modes or zero", () => {
  const group = { id: "11111111-1111-4111-8111-111111111111", kind: "superset", exercise_ids: ["a", "b"], rounds: 2, transition_sec: 0, round_rest_sec: 0 };
  const actual = migrateProgramNumbers({ durationWeeks: 8, days: [{ name: "День", groups: [group], exercises: [{
    exercise_id: "a", sets: 2, rest_sec: 0, reps: "8-12", weight_mode: "per_hand",
    target: { kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: "12.50" },
    set_methods: [{ set_number: 1, kind: "drop", parts: [
      { target_reps: 8, target_weight: "12.50", pause_after_sec: 0 },
      { target_reps: 8, target_weight: "10.25", pause_after_sec: 0 },
    ] }],
  }] }] });
  expect(actual).toEqual({ durationWeeks: "8", days: [{ name: "День", groups: [group], exercises: [{
    exercise_id: "a", sets: "2", rest_sec: "0", reps: "8-12", weight_mode: "per_hand",
    target: { kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: 12.5 },
    set_methods: [{ set_number: 1, kind: "drop", parts: [
      { target_reps: 8, target_weight: 12.5, pause_after_sec: 0 },
      { target_reps: 8, target_weight: 10.25, pause_after_sec: 0 },
    ] }],
  }] }] });
});
