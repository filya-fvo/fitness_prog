import { expect, it } from "vitest";
import { createExecutionRest, remainingRestMs, restoreExecutionRest, claimRestCompletion, adjustExecutionRest, finishExecutionRest } from "./workoutRest";
const clock = (wallMs = 1000, monotonicMs = 1000, processId = "process") => ({ wallMs, monotonicMs, processId });
const targetStep = { id: "B1", blockId: "B", round: 1, exerciseId: "B", setNumber: 1, partId: null, partOrdinal: null, kind: "standard" as const, pauseAfterSec: 0, exerciseRestSec: 60 };
const start = () => createExecutionRest({ owner: "owner", clientWorkoutId: "workout", sourceActionId: "tap", targetStep,
  restKind: "between_sets", durationSec: 120, confirmedAt: clock() })!;

it("counts from confirmation, even when storage/network returns ten seconds later", () => {
  expect(remainingRestMs(start(), clock(11000, 11000))).toBe(110000);
  expect(remainingRestMs(start(), clock(200000, 200000))).toBe(0);
});
it("uses monotonic elapsed time through throttling, midnight/timezone and a backwards wall clock jump", () => {
  expect(remainingRestMs(start(), clock(-9999999, 11000))).toBe(110000);
  expect(remainingRestMs(start(), clock(61000, 61000))).toBe(60000);
});
it("offers explicit continuation when system sleep or a forward wall jump makes elapsed time ambiguous", () => {
  const restored = restoreExecutionRest(start(), { owner: "owner", clientWorkoutId: "workout" }, clock(99999999, 11000))!;
  expect(restored.requiresConfirmation).toBe(true);
  expect(remainingRestMs(restored, clock(99999999, 11000))).toBe(0);
  expect(claimRestCompletion(restored, clock(99999999, 11000)).shouldNotify).toBe(false);
});
it("restores the same deadline after reload and uses a new monotonic anchor", () => {
  const saved = JSON.parse(JSON.stringify(start()));
  const restored = restoreExecutionRest(saved, { owner: "owner", clientWorkoutId: "workout" }, clock(11000, 5, "new"))!;
  expect(restored.transitionId).toBe(saved.transitionId);
  expect(remainingRestMs(restored, clock(0, 10005, "new"))).toBe(100000);
  expect(restoreExecutionRest(saved, { owner: "other", clientWorkoutId: "workout" }, clock())).toBeNull();
  expect(restoreExecutionRest(saved, { owner: "owner", clientWorkoutId: "other" }, clock())).toBeNull();
});
it("requires explicit continuation for ambiguous backwards wall time after a restart", () => {
  const restored = restoreExecutionRest(start(), { owner: "owner", clientWorkoutId: "workout" }, clock(-50000, 0, "new"))!;
  expect(restored.requiresConfirmation).toBe(true);
  expect(remainingRestMs(restored, clock(-50000, 0, "new"))).toBe(0);
  expect(claimRestCompletion(restored, clock(-50000, 0, "new")).shouldNotify).toBe(false);
});
it("signals only once after a late return and never starts another task", () => {
  const first = claimRestCompletion(start(), clock(200000, 200000));
  expect(first.shouldNotify).toBe(true);
  expect(claimRestCompletion(first.rest, clock(300000, 300000)).shouldNotify).toBe(false);
  expect(first.rest.targetStep).toEqual(targetStep);
  expect(first.rest.sourceActionId).toBe("tap");
});
it("zero pause stays zero, extension keeps identity and manual finish emits no alarm", () => {
  expect(createExecutionRest({ ...start(), confirmedAt: clock(), durationSec: 0 })).toBeNull();
  const extended = adjustExecutionRest(start(), 15, clock(11000, 11000));
  expect(extended.transitionId).toBe(start().transitionId);
  expect(remainingRestMs(extended, clock(11000, 11000))).toBe(125000);
  const stopped = finishExecutionRest(extended, clock(12000, 12000));
  expect(remainingRestMs(stopped, clock(12000, 12000))).toBe(0);
  expect(claimRestCompletion(stopped, clock(13000, 13000)).shouldNotify).toBe(false);
});
it("rejects malformed stored data rather than restarting a timer", () => {
  expect(restoreExecutionRest({ ...start(), durationSec: 9999999 }, { owner: "owner", clientWorkoutId: "workout" }, clock())).toBeNull();
  expect(restoreExecutionRest({ ...start(), endsAt: "bad" }, { owner: "owner", clientWorkoutId: "workout" }, clock())).toBeNull();
});

it("does not resurrect a finished pause through the add-time action", () => {
  const rest = start();
  const expired = clock(200000, 200000);
  expect(adjustExecutionRest(rest, 15, expired)).toEqual(rest);
  expect(remainingRestMs(adjustExecutionRest(rest, 15, expired), expired)).toBe(0);
});

it("keeps the duration across midnight and a changed timezone representation of the same instant", () => {
  const midnight = Date.parse("2026-10-19T23:59:50Z");
  const rest = createExecutionRest({ owner: "owner", clientWorkoutId: "workout", sourceActionId: "midnight", targetStep,
    restKind: "between_sets", durationSec: 120, confirmedAt: clock(midnight, 10) })!;
  const afterMidnight = Date.parse("2026-10-20T04:00:10+04:00");
  expect(afterMidnight - midnight).toBe(20000);
  expect(remainingRestMs(rest, clock(afterMidnight, 20010))).toBe(100000);
  expect(rest.endsAt).toBe(midnight + 120000);
});
