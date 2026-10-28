import { describe, expect, it } from "vitest";
import type { Exercise } from "@/types/workout";
import { personalDayFromPlan, personalDayToPlan, personalLegacyTarget, personalProgramInput, parsePersonalProgramDraft, type PersonalDayDraft } from "./personalProgramDraft";

const id = "11111111-1111-4111-8111-111111111111";
const exercise = (load: string) => ({ id, name_ru: "Тест", equipment: "", muscle_group: "", tags: [`load:${load}`] } as Exercise);
const day = (reps: string): PersonalDayDraft => ({ name: "День", exercises: [{ exercise_id: id, sets: "2", rest_sec: "0", reps }] });

describe("legacy personal goals", () => {
  it.each([
    [" 08 – 12 ", "weight_reps", { kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: null }],
    ["10-10", "reps_only", { kind: "reps_only", reps_min: 10, reps_max: 10 }],
    ["100000", "reps_only", { kind: "reps_only", reps_min: 100000, reps_max: 100000 }],
    ["60с", "timed", { kind: "timed", duration_sec: 60 }],
    ["1,5мин", "cardio_machine", { kind: "timed", duration_sec: 90 }],
    ["0.05 min", "timed", { kind: "timed", duration_sec: 3 }],
    ["1440мин", "timed", { kind: "timed", duration_sec: 86400 }],
    ["8с", "weight_reps", null], ["0.01мин", "timed", null], ["1.5с", "timed", null],
  ] as const)("parses %j for %s into a compatible exact goal", (text, load, expected) => {
    expect(personalLegacyTarget(text, exercise(load))).toEqual(expected);
  });
  it.each(["60с", "60", "60s"])("accepts API-compatible timed text %j without creating a typed target or rewriting it", text => {
    const draft = day(text);
    const result = personalDayToPlan(draft, [exercise("timed")]);
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.exercises[0]).toMatchObject({ target_reps: text });
    expect(result.ok && result.value.exercises[0].target).toBeUndefined();
    expect(draft.exercises[0].reps).toBe(text);
  });
  it.each(["60 сек", "1,5мин", "1.5 min"])("requires explicit conversion of API-incompatible legacy text %j", text => {
    const draft = { name: "План", location: "gym" as const, progression: "phased" as const, durationWeeks: "8", days: [day(text)], dayCount: 1, activeDay: 0, step: "days" as const };
    expect(personalProgramInput(draft, [exercise("timed")]).ok).toBe(false);
    const target = personalLegacyTarget(text, exercise("timed"));
    expect(target).not.toBeNull();
    draft.days[0].exercises[0].target = target;
    const result = personalProgramInput(draft, [exercise("timed")]);
    expect(result.ok && result.value.days[0].exercises[0]).toMatchObject({ reps: text === "60 сек" ? "60с" : "90с", target: { kind: "timed", duration_sec: text === "60 сек" ? 60 : 90 } });
    expect(draft.days[0].exercises[0].reps).toBe(text);
  });
  it.each(["0", "12-8", "8с", "8-", "100001", "8 повт", "текст"])("blocks invalid repetition text %j without losing the repair buffer", text => {
    const draft = day(text);
    expect(personalDayToPlan(draft, [exercise("weight_reps")]).ok).toBe(false);
    expect(draft.exercises[0].reps).toBe(text);
  });
  it.each(["0", "86401с", "0,01мин", "1,мин", "60-90", "текст"])("blocks invalid timed text %j without defaults", text => {
    expect(personalDayToPlan(day(text), [exercise("cardio_machine")]).ok).toBe(false);
  });
  it("keeps the 20-character recovery field distinct from the new raw buffers", () => {
    const form = (reps: string) => ({ name: "План", location: "gym", progression: "phased", durationWeeks: "8", dayCount: 1, activeDay: 0, step: "days", days: [day(reps)] });
    expect(parsePersonalProgramDraft(form("x".repeat(20)))).not.toBeNull();
    expect(parsePersonalProgramDraft(form("x".repeat(21)))).toBeNull();
  });
  it("retains methods, groups and unrelated raw buffers while adding a goal explicitly", () => {
    const draft = day(" 08 – 12 ");
    const other = "22222222-2222-4222-8222-222222222222";
    draft.exercises.push({ exercise_id: other, sets: "2", rest_sec: "0", reps: "10" });
    draft.groups = [{ id: "33333333-3333-4333-8333-333333333333", kind: "superset", exercise_ids: [id, other], rounds: 2, transition_sec: 0, round_rest_sec: 30 }];
    draft.exercises[0].set_methods = [{ set_number: 1, kind: "cluster", parts: [{ target_reps: 4, pause_after_sec: 10 }, { target_reps: 4, pause_after_sec: 0 }] }];
    draft.raw = { [`${id}/method/1/part/1/target_reps`]: "04" };
    const result = personalDayToPlan(draft, [exercise("weight_reps"), { ...exercise("reps_only"), id: other }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.value.exercises[0].target = { kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: null };
    const next = personalDayFromPlan(result.value, draft.name, draft);
    expect(next.ok && next.value.exercises[0].reps).toBe(" 08 – 12 ");
    expect(next.ok && next.value.raw).toEqual(draft.raw);
    expect(next.ok && next.value.exercises[0].set_methods).toEqual(draft.exercises[0].set_methods);
    expect(next.ok && next.value.groups).toEqual(draft.groups);
    expect(next.ok && next.value.exercises[1]).toEqual(draft.exercises[1]);
  });
});
