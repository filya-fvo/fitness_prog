import { z } from "zod";
import { fetchExercises } from "@/api/exercises";
import { fetchOfflineWorkoutContext, offlineWorkoutContextSchema, preparedProgramPlanSchema } from "@/api/offlineWorkouts";
import { fetchMyProfile, profileSchema } from "@/api/users";
import { fetchWorkoutLoadHints } from "@/api/workouts";
import { db, type MetaRow } from "@/db/schema";
import { useUserStore } from "@/store/userStore";
import type { Exercise, WorkoutLoadHint } from "@/types/workout";

const headerSchema = z.object({
  bundle: offlineWorkoutContextSchema.innerType().omit({ plans: true }),
  profile: profileSchema, planKeys: z.array(z.string()).max(1764),
});
export type OfflineWorkoutContext = {
  program: z.infer<typeof headerSchema>["bundle"]["program"];
  profile: z.infer<typeof profileSchema>;
  schedule: z.infer<typeof headerSchema>["bundle"]["days"][number]["schedule"];
  plans: z.infer<typeof preparedProgramPlanSchema>[];
  preparedAt: string;
};
const prefix = (owner: string) => `offline-workout:v1:${owner}:`;
const currentOwner = () => useUserStore.getState().user?.id;
function checkOwner(owner: string) {
  if (currentOwner() !== owner) throw new Error("Аккаунт изменился. Повторите подготовку");
}
function row(key: string, data: unknown): MetaRow {
  const value = JSON.stringify(data);
  if (new TextEncoder().encode(value).length > 1900000) throw new Error("План слишком большой для сохранения");
  return { key, value, updatedAt: Date.now() };
}
export async function saveOfflineWorkoutContext(owner: string, input: unknown, rawProfile: unknown, exercises: Exercise[], hints: WorkoutLoadHint[]): Promise<void> {
  checkOwner(owner);
  const bundle = offlineWorkoutContextSchema.parse(input);
  const profile = profileSchema.parse(rawProfile);
  if (bundle.owner !== owner || profile.id !== owner || String(profile.goals.active_program_id || "") !== (bundle.program?.id || "")) throw new Error("Программа изменилась. Повторите подготовку");
  const root = prefix(owner);
  const rows = bundle.plans.map((plan, i) => row(`${root}plan:${i}`, plan));
  const header = row(`${root}header`, { bundle: { ...bundle, plans: undefined }, profile, planKeys: rows.map(item => item.key) });
  await db.transaction("rw", db.meta, db.exercises, db.workoutLoadHints, async () => {
    checkOwner(owner);
    const old = await db.meta.where("key").startsWith(root).primaryKeys();
    await db.meta.bulkDelete(old);
    await db.meta.bulkPut([...rows, header]);
    if (exercises.length) await db.exercises.bulkPut(exercises);
    await db.workoutLoadHints.where("ownerUserId").equals(owner).delete();
    if (hints.length) await db.workoutLoadHints.bulkPut(hints.map(hint => ({ ...hint, key: `${owner}:${hint.exerciseId}`, ownerUserId: owner, updatedAt: Date.now() })));
    checkOwner(owner);
  });
  checkOwner(owner);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("fitness:offline-prepared", { detail: owner }));
}
export async function readOfflineWorkoutContext(owner: string, day: string): Promise<OfflineWorkoutContext | null> {
  if (currentOwner() !== owner) return null;
  return db.transaction("r", db.meta, async () => {
    const saved = await db.meta.get(`${prefix(owner)}header`);
    if (!saved) return null;
    const header = headerSchema.parse(JSON.parse(saved.value));
    if (header.bundle.owner !== owner || header.profile.id !== owner) return null;
    const date = header.bundle.days.find(item => item.requested_date === day);
    if (!date) return null;
    const rows = await db.meta.bulkGet(header.planKeys);
    if (rows.some(item => !item)) return null;
    const plans = rows.map(item => preparedProgramPlanSchema.parse(JSON.parse(item!.value)));
    if (currentOwner() !== owner) return null;
    return { program: header.bundle.program, profile: header.profile, schedule: date.schedule, plans, preparedAt: header.bundle.prepared_at };
  });
}
const running = new Map<string, Promise<{ preparedAt: string }>>();
export function prepareOfflineWorkoutContext(owner: string, start: string): Promise<{ preparedAt: string }> {
  const key = `${owner}:${start}`;
  const existing = running.get(key);
  if (existing) return existing;
  const task = (async () => {
    checkOwner(owner);
    const [bundle, profile] = await Promise.all([fetchOfflineWorkoutContext(start), fetchMyProfile()]);
    checkOwner(owner);
    const exerciseIds = [...new Set(bundle.plans.flatMap(plan => plan.plan.exercises.map(ex => ex.exercise_id)))];
    const exercises: Exercise[] = [];
    let page = 1;
    while (page <= 50) {
      const result = await fetchExercises({ page, pageSize: 200 });
      checkOwner(owner);
      exercises.push(...result.items);
      if (exercises.length >= result.total) break;
      if (!result.items.length || page === 50) throw new Error("Каталог загружен не полностью");
      page++;
    }
    const hints: WorkoutLoadHint[] = [];
    for (let i = 0; i < exerciseIds.length; i += 100) {
      hints.push(...await fetchWorkoutLoadHints(exerciseIds.slice(i, i + 100)));
      checkOwner(owner);
    }
    await saveOfflineWorkoutContext(owner, bundle, profile, exercises, hints);
    return { preparedAt: bundle.prepared_at };
  })().finally(() => running.delete(key));
  running.set(key, task);
  return task;
}
