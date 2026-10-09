import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapExercise, exerciseSchema } from "@/api/exercises";
import { db } from "@/db/schema";
import { useUserStore } from "@/store/userStore";
import { canPrepareOfflineWorkoutContext, installOfflineWorkoutPreparationGuard, readOfflineWorkoutContext, saveOfflineWorkoutContext } from "./offlineWorkoutContext";

const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const programId = "00000000-0000-4000-8000-000000000003";
const snapshot = () => ({
  version: 1 as const, owner, prepared_at: "2026-10-09T08:00:00Z", start: "2026-10-09", end: "2026-10-09",
  program: { id: programId, name: "Программа", structure: { days: [{ day: 1 }] } },
  days: [{ requested_date: "2026-10-09", schedule: { requested_date: "2026-10-09", current: null, next: null } }],
  plans: [{ scheduled_date: "2026-10-09", day_index: 1, week_phase: "medium", readiness: "normal", plan: { title: "План", exercises: [] } }],
});
const exerciseId = "00000000-0000-4000-8000-000000000004";
const exercise = mapExercise(exerciseSchema.parse({ id: exerciseId, name_ru: "Жим", muscle_group: "грудь", difficulty: 2 }));
const hint = { exerciseId, lastWeight: 50, lastReps: 10, lastDate: "2026-10-08", lastDurationSec: null, lastWeightMode: null, lastMachineParams: null, lastRpe: null };
const profile = { id: owner, goals: { active_program_id: programId }, anthropometry: {}, subscription_status: "free", stars_balance: 0, onboarding_completed: true };
function login(id: string) { useUserStore.setState({ user: { ...profile, id }, isAuthenticated: true }); }
beforeEach(async () => { await db.delete(); await db.open(); login(owner); });
afterEach(async () => { await db.delete(); useUserStore.setState({ user: null }); });

describe("durable prepared context", () => {
  it("survives database close and reopen without API", async () => {
    await saveOfflineWorkoutContext(owner, snapshot(), profile, [exercise], [hint]);
    db.close(); await db.open();
    const result = await readOfflineWorkoutContext(owner, "2026-10-09");
    expect(result?.program?.id).toBe(programId);
    expect(result?.profile.goals.active_program_id).toBe(programId);
    expect(result?.plans[0].plan.title).toBe("План");
    expect((await db.exercises.get(exerciseId))?.name_ru).toBe("Жим");
    expect((await db.workoutLoadHints.get(`${owner}:${exerciseId}`))?.lastWeight).toBe(50);
    expect(result?.preparedAt).toBe("2026-10-09T08:00:00Z");
    expect(await readOfflineWorkoutContext(owner, "2026-10-10")).toBeNull();
  });
  it("isolates owners including callers with the old owner", async () => {
    await saveOfflineWorkoutContext(owner, snapshot(), profile, [], []);
    login(other);
    expect(await readOfflineWorkoutContext(owner, "2026-10-09")).toBeNull();
    expect(await readOfflineWorkoutContext(other, "2026-10-09")).toBeNull();
    await expect(saveOfflineWorkoutContext(other, snapshot(), profile, [], [])).rejects.toThrow();
  });
  it("keeps the previous complete bundle when replacement is invalid", async () => {
    await saveOfflineWorkoutContext(owner, snapshot(), profile, [], []);
    const invalid = { ...snapshot(), plans: [{ ...snapshot().plans[0], plan: { title: "Недописанный", exercises: [{ exercise_id: "invalid" }] } }] };
    await expect(saveOfflineWorkoutContext(owner, invalid, profile, [], [])).rejects.toThrow();
    expect((await readOfflineWorkoutContext(owner, "2026-10-09"))?.plans[0].plan.title).toBe("План");
  });
  it("rejects a partial date range and keeps previous data", async () => {
    await saveOfflineWorkoutContext(owner, snapshot(), profile, [], []);
    await expect(saveOfflineWorkoutContext(owner, { ...snapshot(), end: "2026-10-10" }, profile, [], [])).rejects.toThrow();
    expect((await readOfflineWorkoutContext(owner, "2026-10-09"))?.preparedAt).toBe("2026-10-09T08:00:00Z");
  });
  it("rolls back an account change during a transaction", async () => {
    await saveOfflineWorkoutContext(owner, snapshot(), profile, [], []);
    const original = db.meta.bulkPut.bind(db.meta);
    const changed = vi.spyOn(db.meta, "bulkPut").mockImplementation((...args: Parameters<typeof db.meta.bulkPut>) => {
      login(other); return original(...args);
    });
    try { await expect(saveOfflineWorkoutContext(owner, { ...snapshot(), prepared_at: "2026-10-09T09:00:00Z" }, profile, [], [])).rejects.toThrow("Аккаунт изменился"); }
    finally { changed.mockRestore(); login(owner); }
    expect((await readOfflineWorkoutContext(owner, "2026-10-09"))?.preparedAt).toBe("2026-10-09T08:00:00Z");
  });
  it("rolls back storage failure without replacing the manifest", async () => {
    await saveOfflineWorkoutContext(owner, snapshot(), profile, [], []);
    const failing = vi.spyOn(db.meta, "bulkPut").mockRejectedValue(new Error("disk full"));
    try { await expect(saveOfflineWorkoutContext(owner, { ...snapshot(), prepared_at: "2026-10-09T09:00:00Z" }, profile, [], [])).rejects.toThrow("disk full"); }
    finally { failing.mockRestore(); }
    expect((await readOfflineWorkoutContext(owner, "2026-10-09"))?.preparedAt).toBe("2026-10-09T08:00:00Z");
  });
});

it("does not prepare over pending local progress or a closed native sync gate",async()=>{
 expect(await canPrepareOfflineWorkoutContext(owner)).toBe(true);
 await db.syncQueue.put({id:crypto.randomUUID(),ownerUserId:owner,type:"complete_workout",clientWorkoutId:crypto.randomUUID(),payload:{},createdAt:1,attempts:0,lastError:null});
 expect(await canPrepareOfflineWorkoutContext(owner)).toBe(false);
 await db.syncQueue.clear();
 installOfflineWorkoutPreparationGuard(async()=>false);
 try {expect(await canPrepareOfflineWorkoutContext(owner)).toBe(false);}
 finally {installOfflineWorkoutPreparationGuard(async()=>true);}
});

it("keeps the old prepared snapshot when local progress appears before commit",async()=>{
 await saveOfflineWorkoutContext(owner,snapshot(),profile,[],[]);
 await db.syncQueue.put({id:crypto.randomUUID(),ownerUserId:owner,type:"complete_workout",clientWorkoutId:crypto.randomUUID(),payload:{},createdAt:1,attempts:0,lastError:null});
 await expect(saveOfflineWorkoutContext(owner,{...snapshot(),prepared_at:"2026-10-09T09:00:00Z"},profile,[],[],true)).rejects.toThrow("Сначала отправьте");
 expect((await readOfflineWorkoutContext(owner,"2026-10-09"))?.preparedAt).toBe("2026-10-09T08:00:00Z");
});
