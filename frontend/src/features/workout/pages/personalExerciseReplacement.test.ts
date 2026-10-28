import { expect, it } from "vitest";
import type { Exercise } from "@/types/workout";
import { personalDayToPlan, personalProgramInput, replacePersonalExercise, type PersonalDayDraft } from "./personalProgramDraft";

const [a, b, c] = [1, 2, 3].map(n => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`);
function exercise(id: string, load = "weight_reps", name_ru = "Жим"): Exercise {
  return { id, name_ru, muscle_group: "Грудь", equipment: null, tags: [`load:${load}`], weight_rule: "per_hand", description: null, technique: null, common_mistakes: null, difficulty: 1, video_url: null, animation_url: null, thumbnail_url: null, media_duration_sec: null, media_source: "none" };
}
const catalog = [exercise(a), exercise(b), exercise(c, "timed", "Планка")];
function day(): PersonalDayDraft {
  return { name: "День", exercises: [a, b].map(exercise_id => ({ exercise_id, sets: "03", rest_sec: "060", reps: "8-12", weight_mode: "per_hand", target: { kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: 12.5 },
    set_methods: [{ set_number: 3, kind: "cluster", parts: [{ target_reps: 4, target_weight: 12.5, pause_after_sec: 20 }, { target_reps: 4, target_weight: 12.5, pause_after_sec: 0 }] }] })),
    raw: { [`${a}/target/reps_min`]: "010", [`${b}/target/reps_min`]: "009" },
    groups: [{ id: "33333333-3333-4333-8333-333333333333", kind: "superset", exercise_ids: [a, b], rounds: 3, transition_sec: 0, round_rest_sec: 60 }] };
}
it("requires an explicit reset before changing load and preserves the original day", () => {
  const original = day(), before = structuredClone(original);
  expect(replacePersonalExercise(original, a, catalog[2], catalog).ok).toBe(false);
  expect(original).toEqual(before);
  const result = replacePersonalExercise(original, a, catalog[2], catalog, true);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  expect(result.value.exercises[0]).toEqual({ exercise_id: c, sets: "03", rest_sec: "060", reps: "45с", target: { kind: "timed", duration_sec: 45 } });
  expect(result.value.exercises[1]).toEqual(before.exercises[1]);
  expect(result.value.raw).toEqual({ [`${b}/target/reps_min`]: "009" });
  expect(result.value.groups).toEqual(before.groups?.map(group => ({ ...group, exercise_ids: [c, b] })));
  expect(personalDayToPlan(result.value, catalog).ok).toBe(true);
  const request = personalProgramInput({ name: "Мой план", location: "gym", progression: "phased", durationWeeks: "8", dayCount: 1, activeDay: 0, step: "days", days: [result.value] }, catalog);
  expect(request.ok && request.value.days[0].exercises[0]).toEqual({ exercise_id: c, sets: 3, rest_sec: 60, reps: "45с", target: { kind: "timed", duration_sec: 45 } });
  expect(original).toEqual(before);
});
it("keeps compatible source raw/method ownership and canonical settings across replacement", () => {
  const original = day(); const target = exercise(c);
  original.raw![`${a}/method/3/part/1/target_reps`] = "04";
  const result = replacePersonalExercise(original, a, target, [...catalog.slice(0, 2), target]);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  expect(result.value.exercises[0]).toEqual({ ...original.exercises[0], exercise_id: c });
  expect(result.value.raw).toEqual({ [`${c}/target/reps_min`]: "010", [`${b}/target/reps_min`]: "009", [`${c}/method/3/part/1/target_reps`]: "04" });
  const plan = personalDayToPlan(result.value, [...catalog.slice(0, 2), target]);
  expect(plan.ok && plan.value.exercises[0]).toMatchObject({ target: { reps_min: 10, reps_max: 12, target_weight: 12.5 }, weight_mode: "per_hand", set_methods: original.exercises[0].set_methods });
});
it("resets source timed text and minute ownership when switching to weighted defaults", () => {
  const original = day(); original.groups = [];
  original.exercises = [{ exercise_id: c, sets: "3", rest_sec: "60", reps: "45с", target: { kind: "timed", duration_sec: 45 } }, original.exercises[1]];
  original.raw = { [`${c}/target/duration_sec`]: "1,", [`${b}/target/reps_min`]: "009" };
  original.timeUnits = { [c]: "minutes" };
  const result = replacePersonalExercise(original, c, catalog[0], catalog, true);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  expect(result.value.exercises[0]).toEqual({ exercise_id: a, sets: "3", rest_sec: "60", reps: "8-12", target: { kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: null }, weight_mode: "per_hand" });
  expect(result.value.raw).toEqual({ [`${b}/target/reps_min`]: "009" });
  expect(result.value.timeUnits).toEqual({});
});
it("preserves timed minute buffers under compatible replacement ownership", () => {
  const original = day(); original.groups = [];
  original.exercises = [{ exercise_id: a, sets: "3", rest_sec: "60", reps: "45с", target: { kind: "timed", duration_sec: 45 } }, original.exercises[1]];
  original.raw = { [`${a}/target/duration_sec`]: "01,500", [`${b}/target/reps_min`]: "009" }; original.timeUnits = { [a]: "minutes" };
  const timedCatalog = [exercise(a, "timed"), catalog[1], catalog[2]];
  const result = replacePersonalExercise(original, a, catalog[2], timedCatalog);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  expect(result.value.timeUnits).toEqual({ [c]: "minutes" });
  expect(result.value.raw).toEqual({ [`${c}/target/duration_sec`]: "01,500", [`${b}/target/reps_min`]: "009" });
  const plan = personalDayToPlan(result.value, timedCatalog);
  expect(plan.ok && plan.value.exercises[0].target).toEqual({ kind: "timed", duration_sec: 90 });
});
it("repairs an unfinished source goal only after reset and refuses any unrelated invalid owner", () => {
  const original = day(); original.raw![`${a}/target/reps_min`] = "";
  const repaired = replacePersonalExercise(original, a, catalog[2], catalog, true);
  expect(repaired.ok).toBe(true);
  original.raw![`${b}/target/reps_min`] = "";
  const before = structuredClone(original);
  const rejected = replacePersonalExercise(original, a, catalog[2], catalog, true);
  expect(rejected.ok).toBe(false);
  if (rejected.ok) throw new Error("unexpected valid proposal");
  expect(rejected.errors).toHaveProperty("exercises.1.target.reps_min");
  expect(original).toEqual(before);
});
it("does not bypass pending groups, missing numbers, duplicates or the catalog boundary", () => {
  const original = day(); original.exercises[0].sets = "";
  expect(replacePersonalExercise(original, a, catalog[2], catalog, true).ok).toBe(false);
  original.exercises[0].sets = "3";
  original.groupProposal = { ...original.groups![0], rounds: "3", transition_sec: "0", round_rest_sec: "60", isNew: false };
  expect(replacePersonalExercise(original, a, catalog[2], catalog, true).ok).toBe(false);
  delete original.groupProposal;
  expect(replacePersonalExercise(original, a, catalog[1], catalog, true).ok).toBe(false);
  expect(replacePersonalExercise(original, a, catalog[2], catalog.slice(0, 2), true).ok).toBe(false);
});
it("requires explicit reset for a legacy row whose numeric reps would otherwise become seconds", () => {
  const original = day(); original.groups = []; original.exercises[0].target = undefined; original.exercises[0].reps = "8"; delete original.exercises[0].set_methods;
  delete original.raw![`${a}/target/reps_min`];
  const before = structuredClone(original);
  expect(replacePersonalExercise(original, a, catalog[2], catalog).ok).toBe(false);
  expect(original).toEqual(before);
  const result = replacePersonalExercise(original, a, catalog[2], catalog, true);
  expect(result.ok && result.value.exercises[0].target).toEqual({ kind: "timed", duration_sec: 45 });
});
it("keeps unrelated invalid method/group buffers intact while rejecting the reset proposal", () => {
  for (const key of [`${b}/method/3/part/1/target_reps`, "33333333-3333-4333-8333-333333333333/rounds"]) {
    const original = day(); original.raw![key] = ""; const before = structuredClone(original);
    expect(replacePersonalExercise(original, a, catalog[2], catalog, true).ok).toBe(false);
    expect(original).toEqual(before);
  }
});
it("uses the actual catalog timed default for a cardio replacement", () => {
  const target = { ...catalog[2], name_ru: "Беговая дорожка", muscle_group: "Кардио" };
  const result = replacePersonalExercise(day(), a, target, [...catalog.slice(0, 2), target], true);
  expect(result.ok && result.value.exercises[0].target).toEqual({ kind: "timed", duration_sec: 300 });
});
