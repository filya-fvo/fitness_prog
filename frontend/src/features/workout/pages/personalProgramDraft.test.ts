import { describe, expect, it } from "vitest";
import { personalDayFromPlan, personalDayToPlan, personalProgramInput, parsePersonalProgramDraft, type PersonalProgramDraft } from "./personalProgramDraft";
import type { Exercise, WorkoutPlan } from "@/types/workout";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const group = { id: "33333333-3333-4333-8333-333333333333", kind: "superset" as const, exercise_ids: [a, b], rounds: 2, transition_sec: 0, round_rest_sec: 600 };
const plan: WorkoutPlan = { execution_version: 2, groups: [group], exercises: [a, b].map((id, index) => ({
  exercise_id: id, order: index + 1, target_sets: 2, target_reps: "8-12", rest_sec: 0,
  target: { kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: 12.5 }, weight_mode: "per_hand",
  set_methods: [{ set_number: 1, kind: "drop", parts: [{ target_reps: 8, target_weight: 12.5, pause_after_sec: 0 }, { target_reps: 6, target_weight: 10.25, pause_after_sec: 0 }] }],
})) };
const catalog = [a, b].map(id => ({ id, tags: [], weight_rule: "per_hand", equipment: "гантели", name_ru: "Жим гантелей" } as unknown as Exercise));
function form(): PersonalProgramDraft {
  const day = personalDayFromPlan(plan, "День");
  if (!day.ok) throw new Error("fixture");
  return { name: "Мой план", location: "gym", progression: "phased", durationWeeks: "8", days: [day.value], dayCount: 1, activeDay: 0, step: "days" };
}

describe("personal program draft boundary", () => {
  it("retains an editable intermediate drop topology without allowing submission", () => {
    const draft = form();
    const next = structuredClone(plan);
    next.exercises[0].set_methods![0].parts[1].target_weight = 20;
    const converted = personalDayFromPlan(next, "День", draft.days[0], [], { allowInvalidTopology: true });
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;
    expect(converted.value.exercises[0].set_methods![0].parts[1].target_weight).toBe(20);
    expect(parsePersonalProgramDraft({ ...draft, days: [converted.value] })).not.toBeNull();
    expect(personalProgramInput({ ...draft, days: [converted.value] }, catalog).ok).toBe(false);
    expect(personalDayFromPlan(next, "День").ok).toBe(false);
  });
  it("roundtrips complete methods, typed targets, day-only groups, modes and zero through one atomic payload", () => {
    const draft = form();
    expect(personalDayToPlan(draft.days[0], catalog)).toEqual({ ok: true, value: plan });
    const input = personalProgramInput(draft, catalog);
    expect(input.ok).toBe(true);
    if (!input.ok) return;
    expect(input.value).toEqual({ name: "Мой план", location: "gym", progression: "phased", duration_weeks: 8, days: [{ name: "День", groups: [group], exercises: plan.exercises.map(row => ({
      exercise_id: row.exercise_id, sets: 2, reps: "8-12", rest_sec: 0, target: row.target, set_methods: row.set_methods, weight_mode: "per_hand",
    })) }] });
    expect(input.value.days[0].exercises[0]).not.toHaveProperty("groups");
  });
  it("normalizes unknown external plan Decimal strings and sorts by explicit order", () => {
    const external = JSON.parse(JSON.stringify(plan));
    external.exercises.reverse();
    external.exercises[0].set_methods[0].parts[0].target_weight = "12.50";
    external.exercises[0].target.target_weight = "12.50";
    const converted = personalDayFromPlan(external, "День");
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;
    expect(personalDayToPlan(converted.value, catalog)).toEqual({ ok: true, value: plan });
  });
  it("keeps invalid raw text through reorder and recovery, but blocks submission", () => {
    const draft = form();
    draft.days[0].exercises[0].sets = "";
    draft.days[0].raw = { [`${a}/method/1/part/1/target_weight`]: "1," };
    const reordered = { ...plan, exercises: [...plan.exercises].reverse().map((row, i) => ({ ...row, order: i + 1 })), groups: [] };
    const changed = personalDayFromPlan(reordered, "День", draft.days[0]);
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.value.exercises.find(row => row.exercise_id === a)?.sets).toBe("");
    expect(changed.value.raw).toEqual(draft.days[0].raw);
    expect(personalProgramInput({ ...draft, days: [changed.value] }, catalog).ok).toBe(false);
    expect(parsePersonalProgramDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
  });
  it("updates only explicitly edited raw fields and drops buffers for removed owners", () => {
    const draft = form();
    draft.days[0].exercises[0].sets = "";
    draft.days[0].exercises[0].rest_sec = "-";
    draft.days[0].raw = { [`${a}/method/1/part/1/target_weight`]: "1,", [`${group.id}/rounds`]: "" };
    const changed = personalDayFromPlan({ ...plan, groups: [] }, "День", draft.days[0], [`${a}/sets`]);
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.value.exercises[0]).toMatchObject({ sets: "2", rest_sec: "-" });
    expect(changed.value.raw).toEqual({ [`${a}/method/1/part/1/target_weight`]: "1," });
  });
  it.each(["", "-1", "1.5", "9", "NaN"])("rejects invalid sets %j without clamping", raw => {
    const draft = form(); draft.days[0].exercises[0].sets = raw;
    expect(personalProgramInput(draft, catalog).ok).toBe(false);
    expect(draft.days[0].exercises[0].sets).toBe(raw);
  });
  it.each(["", "-1", "1.5", "301"])("rejects invalid ordinary rest %j instead of treating blank as zero", raw => {
    const draft = form(); draft.days[0].exercises[0].rest_sec = raw;
    const result = personalProgramInput(draft, catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).some(key => key.endsWith("rest_sec"))).toBe(true);
  });
  it.each(["", "0", "1.5", "53"])("rejects invalid weeks %j", raw => {
    const draft = form(); draft.durationWeeks = raw;
    expect(personalProgramInput(draft, catalog).ok).toBe(false);
  });
  it("checks all selected days but preserves hidden retained days without submitting them", () => {
    const draft = form();
    draft.days.push({ name: "Скрытый", exercises: [] });
    expect(parsePersonalProgramDraft(draft)).toEqual(draft);
    const result = personalProgramInput(draft, catalog);
    expect(result.ok && result.value.days.length).toBe(1);
    draft.dayCount = 2;
    expect(personalProgramInput(draft, catalog).ok).toBe(false);
  });
  it("rejects personal limits, corrupt topology and incompatible catalog targets", () => {
    const draft = form(); draft.days[0].groups![0].rounds = 9;
    expect(personalProgramInput(draft, catalog).ok).toBe(false);
    expect(personalProgramInput(form(), catalog.map(row => ({ ...row, tags: ["timed"], name_ru: "Планка" }))).ok).toBe(false);
    expect(personalProgramInput(form(), catalog.slice(1)).ok).toBe(false);
    const corrupt = form(); corrupt.days[0].groups![0].exercise_ids.reverse();
    expect(personalProgramInput(corrupt, catalog).ok).toBe(false);
    const tooMany = form(); tooMany.days = Array.from({ length: 8 }, () => tooMany.days[0]); tooMany.dayCount = 8;
    expect(parsePersonalProgramDraft(tooMany)).toBeNull();
    const duplicate = form(); duplicate.days[0].exercises[1].exercise_id = a;
    expect(personalProgramInput(duplicate, catalog).ok).toBe(false);
  });
  it("blocks malformed methods and blank Decimal weights from external data", () => {
    const external = JSON.parse(JSON.stringify(plan));
    external.exercises[0].set_methods[0].parts[0].target_weight = "";
    expect(personalDayFromPlan(external, "День").ok).toBe(false);
    external.exercises[0].set_methods[0].parts[0].target_weight = "NaN";
    expect(personalDayFromPlan(external, "День").ok).toBe(false);
  });
  it("validates target variants independently of current optional keys and rejects unknown persisted data", () => {
    const draft = form();
    draft.days[0].exercises[0].target = { kind: "timed", duration_sec: 86400 };
    draft.days[0].exercises[1].target = null;
    expect(parsePersonalProgramDraft(draft)).toEqual(draft);
    expect(parsePersonalProgramDraft({ ...draft, catalog: [{ image_url: "private" }] })).toBeNull();
    expect(parsePersonalProgramDraft({ ...draft, days: [{ ...draft.days[0], raw: { "not-owned": "1" } }] })).toBeNull();
  });
  it("retains absent/null target and mode semantics and optional method weights", () => {
    const source = { execution_version: 2, exercises: [
      { exercise_id: a, order: 1, target_sets: 1, target_reps: "8", rest_sec: 0 },
      { exercise_id: b, order: 2, target_sets: 1, target_reps: "8", rest_sec: 0, target: null, weight_mode: null,
        set_methods: [{ set_number: 1, kind: "cluster", parts: [{ target_reps: 8, pause_after_sec: 0 }, { target_reps: 8, target_weight: null, pause_after_sec: 0 }] }] },
    ] };
    const converted = personalDayFromPlan(source, "День");
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;
    expect(personalDayToPlan(converted.value, catalog)).toEqual({ ok: true, value: source });
    expect(converted.value.exercises[0]).not.toHaveProperty("target");
  });
  it.each(["exercises", "methods", "parts", "groups"] as const)("rejects oversized personal %s collections at recovery and submission boundaries", collection => {
    const draft = form();
    const day = draft.days[0];
    if (collection === "exercises") day.exercises = Array.from({ length: 13 }, (_, i) => ({ ...day.exercises[0], exercise_id: `11111111-1111-4111-8111-${String(i + 1).padStart(12, "0")}` }));
    if (collection === "methods") day.exercises[0].set_methods = Array.from({ length: 9 }, (_, i) => ({ ...day.exercises[0].set_methods![0], set_number: i + 1 }));
    if (collection === "parts") day.exercises[0].set_methods![0].parts = Array.from({ length: 9 }, () => ({ target_reps: 8, target_weight: 12.5, pause_after_sec: 0 }));
    if (collection === "groups") day.groups = Array.from({ length: 7 }, (_, i) => ({ ...group, id: `33333333-3333-4333-8333-${String(i + 1).padStart(12, "0")}` }));
    expect(parsePersonalProgramDraft(draft)).toBeNull();
    expect(personalProgramInput(draft, catalog).ok).toBe(false);
  });
  it.each(["target", "method", "group", "last-pause"] as const)("blocks invalid owning %s buffers instead of substituting committed values", field => {
    const draft = form();
    const key = field === "target" ? `${a}/target/reps_min` : field === "group" ? `${group.id}/round_rest_sec`
      : `${a}/method/1/part/${field === "last-pause" ? 2 : 1}/pause_after_sec`;
    draft.days[0].raw = { [key]: field === "last-pause" ? "1" : "" };
    expect(parsePersonalProgramDraft(draft)).toEqual(draft);
    expect(personalProgramInput(draft, catalog).ok).toBe(false);
  });
  it("allows an explicitly blank optional weight as at-execution, without losing zero pauses", () => {
    const draft = form();
    draft.days[0].raw = { [`${a}/target/target_weight`]: "", [`${a}/method/1/part/1/target_weight`]: "" };
    const result = personalProgramInput(draft, catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.days[0].exercises[0].target).toEqual({ kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: null });
    expect(result.value.days[0].exercises[0].set_methods![0].parts[0]).toEqual({ target_reps: 8, target_weight: null, pause_after_sec: 0 });
  });
  it("checks method load compatibility even when there is no typed goal", () => {
    const draft = form();
    for (const row of draft.days[0].exercises) delete row.target;
    expect(personalProgramInput(draft, catalog.map(row => ({ ...row, tags: ["load:timed"] }))).ok).toBe(false);
  });
  it.each([
    { label: "range", target: { kind: "weight_reps", reps_min: 12, reps_max: 15, target_weight: 12.5 }, raw: {}, expected: "12-15" },
    { label: "equal", target: { kind: "reps_only", reps_min: 15, reps_max: 15 }, raw: {}, expected: "15" },
    { label: "time", target: { kind: "timed", duration_sec: 95 }, raw: {}, expected: "95с" },
    { label: "buffered range", target: { kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: 12.5 }, raw: { reps_min: "12", reps_max: "15" }, expected: "12-15" },
    { label: "buffered time", target: { kind: "timed", duration_sec: 60 }, raw: { duration_sec: "95" }, expected: "95с" },
  ] as const)("derives canonical/API compatibility text from the valid $label goal without rewriting raw recovery", ({ target, raw, expected }) => {
    const draft = form(); const row = draft.days[0].exercises[0];
    row.target = { ...target }; row.reps = "3-5"; delete row.set_methods;
    draft.days[0].raw = Object.fromEntries(Object.entries(raw).map(([key, value]) => [`${a}/target/${key}`, value]));
    const localCatalog = catalog.map(exercise => exercise.id === a ? { ...exercise, tags: [`load:${target.kind === "timed" ? "timed" : target.kind}`] } : exercise);
    const canonical = personalDayToPlan(draft.days[0], localCatalog);
    expect(canonical.ok).toBe(true);
    if (!canonical.ok) return;
    expect(canonical.value.exercises[0].target_reps).toBe(expected);
    const input = personalProgramInput(draft, localCatalog);
    expect(input.ok && input.value.days[0].exercises[0].reps).toBe(expected);
    expect(row.reps).toBe("3-5");
    expect(draft.days[0].raw).toEqual(Object.fromEntries(Object.entries(raw).map(([key, value]) => [`${a}/target/${key}`, value])));
    expect(parsePersonalProgramDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
  });
  it.each([
    { kind: "reps_only", reps_min: 12, reps_max: 15 },
    { kind: "weight_reps", reps_min: 12, reps_max: 15, target_weight: 12.5 },
    { kind: "timed", duration_sec: 95 },
  ] as const)("preserves owning raw reps through a full $kind draft-plan-draft no-op cycle", target => {
    const day = form().days[0];
    day.exercises[0].reps = "3-5"; day.exercises[0].target = { ...target }; delete day.exercises[0].set_methods;
    const canonical = personalDayToPlan(day);
    expect(canonical.ok).toBe(true);
    if (!canonical.ok) return;
    expect(canonical.value.exercises[0].target_reps).toBe(target.kind === "timed" ? "95с" : "12-15");
    const returned = personalDayFromPlan(canonical.value, day.name, day);
    expect(returned).toEqual({ ok: true, value: day });
  });
  it("preserves owning raw reps and raw buffers by identity through an unrelated canonical reorder", () => {
    const day = form().days[0]; day.groups = [];
    day.exercises[0].reps = "3-5"; day.exercises[0].target = { kind: "reps_only", reps_min: 12, reps_max: 15 }; delete day.exercises[0].set_methods;
    day.raw = { [`${a}/target/reps_min`]: "0012" };
    const canonical = personalDayToPlan(day);
    if (!canonical.ok) throw new Error("fixture");
    const reordered = { ...canonical.value, exercises: [...canonical.value.exercises].reverse().map((row, i) => ({ ...row, order: i + 1 })) };
    expect(personalDayFromPlan(reordered, day.name, day)).toEqual({ ok: true, value: { ...day, exercises: [...day.exercises].reverse() } });
  });
  it("accepts an explicit legacy edit while keeping the typed goal authoritative in the generated plan", () => {
    const day = form().days[0]; day.exercises[0].reps = "3-5";
    const canonical = personalDayToPlan(day);
    if (!canonical.ok) throw new Error("fixture");
    canonical.value.exercises[0].target_reps = "6-8";
    const returned = personalDayFromPlan(canonical.value, day.name, day, [`${a}/reps`]);
    expect(returned.ok).toBe(true);
    if (!returned.ok) return;
    expect(returned.value.exercises[0].reps).toBe("6-8");
    const forward = personalDayToPlan(returned.value);
    expect(forward.ok && forward.value.exercises[0].target_reps).toBe("8-12");
  });
  it("accepts ordinary no-target external legacy updates without an explicit edit path", () => {
    const day = form().days[0]; day.exercises[0].reps = "3-5"; delete day.exercises[0].target;
    const canonical = personalDayToPlan(day);
    if (!canonical.ok) throw new Error("fixture");
    canonical.value.exercises[0].target_reps = "6-8";
    const returned = personalDayFromPlan(canonical.value, day.name, day);
    expect(returned.ok && returned.value.exercises[0].reps).toBe("6-8");
  });
  it("keeps the existing raw fallback when adding a typed goal without editing legacy reps", () => {
    const day = form().days[0]; day.exercises[0].reps = "3-5"; delete day.exercises[0].target;
    const canonical = personalDayToPlan(day);
    if (!canonical.ok) throw new Error("fixture");
    canonical.value.exercises[0].target = { kind: "weight_reps", reps_min: 12, reps_max: 15, target_weight: null };
    canonical.value.exercises[0].target_reps = "12-15";
    const returned = personalDayFromPlan(canonical.value, day.name, day);
    expect(returned.ok && returned.value.exercises[0].reps).toBe("3-5");
  });
  it("retains the owning legacy fallback when a typed goal is removed after a full no-op cycle", () => {
    const day = form().days[0]; day.exercises[0].reps = "3-5";
    const canonical = personalDayToPlan(day);
    if (!canonical.ok) throw new Error("fixture");
    const returned = personalDayFromPlan(canonical.value, day.name, day);
    if (!returned.ok) throw new Error("fixture");
    canonical.value.exercises[0].target = null;
    const cleared = personalDayFromPlan(canonical.value, day.name, returned.value);
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(cleared.value.exercises[0].reps).toBe("3-5");
    const forward = personalDayToPlan(cleared.value);
    expect(forward.ok && forward.value.exercises[0].target_reps).toBe("3-5");
  });
});
