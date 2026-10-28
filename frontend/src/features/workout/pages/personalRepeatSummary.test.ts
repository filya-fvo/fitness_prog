import { expect, it } from "vitest";
import { personalRepeatSummary } from "./personalRepeatSummary";
import type { PersonalExerciseDraft } from "./personalProgramDraft";

it("shows a single repeat count for numerically equal raw bounds without rewriting them", () => {
  const item: PersonalExerciseDraft = { exercise_id: "row", sets: "3", reps: "8-12", rest_sec: "60", target: { kind: "reps_only", reps_min: 8, reps_max: 12 } };
  const raw = { "row/target/reps_min": "0009", "row/target/reps_max": "9" };
  expect(personalRepeatSummary(item, raw)).toBe("9");
  expect(raw).toEqual({ "row/target/reps_min": "0009", "row/target/reps_max": "9" });
  expect(personalRepeatSummary(item, { "row/target/reps_min": "" })).toBe("—–12");
});

it("summarizes the authoritative parsed time and never a stale legacy or canonical duration", () => {
  const item: PersonalExerciseDraft = { exercise_id: "row", sets: "3", reps: "8-12", rest_sec: "0", target: { kind: "timed", duration_sec: 45 } };
  expect(personalRepeatSummary(item, {})).toBe("45 с");
  expect(personalRepeatSummary(item, { "row/target/duration_sec": "1,5" }, "minutes")).toBe("1:30");
  for (const text of ["", "1,", "0", "0.01"]) expect(personalRepeatSummary(item, { "row/target/duration_sec": text }, "minutes")).toBe("—");
  expect(personalRepeatSummary(item, {}, "minutes")).toBe("—");
});
