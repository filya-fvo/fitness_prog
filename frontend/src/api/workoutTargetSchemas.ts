import { z } from "zod";

// Pydantic serializes Decimal as a string. Validate its precision before Number
// can round away extra decimal places; reject coercion of blanks and booleans.
const decimal = z.union([z.number().finite(), z.string().regex(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i)])
  .refine(value => {
    const [mantissa, exponent = "0"] = String(value).toLowerCase().split("e");
    const fractionLength = (mantissa.split(".")[1] ?? "").length;
    const trailingZeros = mantissa.replace(".", "").match(/0+$/)?.[0].length ?? 0;
    return fractionLength - Number(exponent) - trailingZeros <= 2;
  }, "Weight must have at most two decimal places")
  .transform(Number).pipe(z.number().finite().positive().max(10_000));
const reps = z.number().int().min(1).max(100_000);

export const explicitWorkoutTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("reps_only"), reps_min: reps, reps_max: reps }).strict(),
  z.object({ kind: z.literal("weight_reps"), reps_min: reps, reps_max: reps, target_weight: decimal.nullable() }).strict(),
  z.object({ kind: z.literal("timed"), duration_sec: z.number().int().min(1).max(86400) }).strict(),
]).superRefine((target, ctx) => {
  if (target.kind !== "timed" && target.reps_min > target.reps_max) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reps_max"], message: "Minimum repetitions must not exceed maximum" });
  }
});

export type ExplicitWorkoutTarget = z.infer<typeof explicitWorkoutTargetSchema>;
