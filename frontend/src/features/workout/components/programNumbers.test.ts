import { expect, it } from "vitest";
import { changeProgramTimeUnit, migrateProgramNumbers, programTimeSeconds, validProgramWeight } from "./programNumbers";

it.each([
  ["1", "seconds", 1], ["86400", "seconds", 86400], ["00090", "seconds", 90],
  ["0.05", "minutes", 3], ["0,15", "minutes", 9], ["1.15", "minutes", 69], ["1,50", "minutes", 90],
  ["1439.95", "minutes", 86397], ["1440.0000", "minutes", 86400], ["0001.5000", "minutes", 90],
] as const)("parses complete time %j %s exactly", (value, unit, seconds) => {
  expect(programTimeSeconds(value, unit)).toBe(seconds);
});

it.each(["", "-", "-1", "0", "1,", "1.", "0.01", "0.001", "1.001", "1440.05", "1e1", "+1", " 1 ", "0x10", ".5"])("rejects invalid minute text %j without repair or rounding", value => {
  expect(programTimeSeconds(value, "minutes")).toBeNull();
  expect(changeProgramTimeUnit(value, "minutes", "seconds")).toBe(value);
});
it.each(["", "-1", "0", "86401", "1.5", "1,5", "1.0", "1e1", " 1 "])("rejects non-integer second text %j", value => {
  expect(programTimeSeconds(value, "seconds")).toBeNull();
  expect(changeProgramTimeUnit(value, "seconds", "minutes")).toBe(value);
});
it.each([
  ["90", "seconds", "minutes", "1.5"], ["3", "seconds", "minutes", "0.05"],
  ["1", "seconds", "minutes", null], ["86400", "seconds", "minutes", "1440"],
  ["1,15", "minutes", "seconds", "69"], ["1,500", "minutes", "minutes", "1,500"],
] as const)("switches %j from %s to %s only without precision loss", (value, from, to, expected) => {
  expect(changeProgramTimeUnit(value, from, to)).toBe(expected);
});
it("retains the exact seconds for every representable time in the full valid range", () => {
  const failures: number[] = [];
  for (let seconds = 1; seconds <= 86400; seconds++) {
    const minutes = changeProgramTimeUnit(String(seconds), "seconds", "minutes");
    if (seconds % 3 ? minutes !== null : minutes === null || programTimeSeconds(minutes, "minutes") !== seconds) failures.push(seconds);
  }
  expect(failures).toEqual([]);
});
it.each(["", "12,50", "12.5000", "0.0100", "10000"])("keeps complete optional weight %j", value => expect(validProgramWeight(value)).toBe(true));
it.each(["12.", "12,", "0", "-1", "10000.01", "1.001", "0.0001", "1e1", " 12 "])("rejects invalid weight %j before API coercion", value => expect(validProgramWeight(value)).toBe(false));

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
