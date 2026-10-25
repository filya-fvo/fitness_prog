import { describe, expect, it } from "vitest";
import { workoutPlanSchema } from "./workouts";

const row = { exercise_id: "00000000-0000-4000-8000-000000000003", order: 1, target_sets: 3, target_reps: "8-12", suggested_weight: "90.00" };
const parse = (target: unknown) => workoutPlanSchema.parse({ execution_version: 2, exercises: [{ ...row, target }] }).exercises[0];
const valid = [
  { kind: "reps_only", reps_min: 1, reps_max: 100000 },
  { kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: 40 },
  { kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: null },
  { kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: 0.01 },
  { kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: 10000 },
  { kind: "timed", duration_sec: 86400 },
];

describe("explicit workout target API boundary", () => {
  it.each(valid)("preserves valid target %j without repurposing legacy fields", target => {
    const result = parse(target);
    expect(result).toHaveProperty("target", target);
    expect(result.target_reps).toBe("8-12");
    expect(result.suggested_weight).toBe("90.00");
  });

  it("parses Pydantic Decimal JSON into the typed numeric goal", () => {
    expect(parse({ kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: "40.00" })).toHaveProperty("target", valid[1]);
  });

  const invalid = [
    {}, { kind: "rest_pause" }, { kind: "unknown" },
    { kind: "timed", duration_sec: 1, reps_min: 1 },
    { kind: "reps_only", reps_min: 2, reps_max: 1 },
    { kind: "reps_only", reps_min: 1, reps_max: 2, target_weight: null },
    { kind: "weight_reps", reps_min: 1, reps_max: 2 },
    ...[0, -1, 86401, 1.5, true, "1", NaN, Infinity].map(duration_sec => ({ kind: "timed", duration_sec })),
    ...[0, -1, 100001, 1.5, true, "1", NaN, Infinity].map(reps_min => ({ kind: "reps_only", reps_min, reps_max: 100000 })),
    ...[0, 100001, 1.5, true, "1", NaN, Infinity].map(reps_max => ({ kind: "reps_only", reps_min: 1, reps_max })),
    ...[0, -1, 10000.01, "1.001", 1.001, true, "", " ", NaN, Infinity, "NaN", "Infinity"].map(target_weight => ({ kind: "weight_reps", reps_min: 1, reps_max: 2, target_weight })),
  ];
  it.each(invalid)("rejects invalid or extra variant data %j", target => {
    expect(() => parse(target)).toThrow();
  });

  it("preserves absence and explicit null", () => {
    expect(workoutPlanSchema.parse({ exercises: [row] }).exercises[0]).not.toHaveProperty("target");
    expect(parse(null)).toHaveProperty("target", null);
  });
});

it.each(["100e-3", "1.000e1", "0.0001e4"])("accepts exact two-decimal Decimal notation %s", target_weight => {
  expect(parse({ kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight })).toHaveProperty("target.target_weight", Number(target_weight));
});

it.each(["1.00000000000000001", "1001e-3"])("rejects overprecise Decimal strings before numeric rounding %s", target_weight => {
  expect(() => parse({ kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight })).toThrow();
});
