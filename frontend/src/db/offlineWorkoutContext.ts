import type Dexie from "dexie";
import { overlayOfflineProgramProgress } from "@/utils/offlineProgramProgress";
import { z } from "zod";
import { fetchExercises } from "@/api/exercises";
import { fetchOfflineWorkoutContext, offlineWorkoutContextSchema, preparedProgramPlanSchema } from "@/api/offlineWorkouts";
import { fetchMyProfile, profileSchema } from "@/api/users";
import { fetchWorkoutLoadHints } from "@/api/workouts";
import { db, type MetaRow } from "@/db/schema";
import { useUserStore } from "@/store/userStore";
import type { Exercise, WorkoutLoadHint, Workout } from "@/types/workout";

const headerSchema = z.object({
  bundle: offlineWorkoutContextSchema.innerType().omit({ plans: true }),
  profile: profileSchema, completedWorkoutIds: z.array(z.string().min(1).max(128)).max(50000), planKeys: z.array(z.string()).max(3528),
});
export type OfflineWorkoutContext = {
  program: z.infer<typeof headerSchema>["bundle"]["program"];
  profile: z.infer<typeof profileSchema>;
  schedule: z.infer<typeof headerSchema>["bundle"]["days"][number]["schedule"];
  plans: z.infer<typeof preparedProgramPlanSchema>[];
  preparedAt: string;
  scheduleFingerprint: string;
};
const prefix = (owner: string) => `offline-workout:v1:${owner}:`;
const currentOwner = () => useUserStore.getState().user?.id;
function checkOwner(owner: string) {
  if (currentOwner() !== owner) throw new Error("Аккаунт изменился. Повторите подготовку");
}
let preparationGuard: (owner: string) => Promise<boolean> = async () => true;
export function installOfflineWorkoutPreparationGuard(guard: typeof preparationGuard): void { preparationGuard = guard; }
export async function canPrepareOfflineWorkoutContext(owner: string): Promise<boolean> {
  return currentOwner() === owner && await db.syncQueue.where("ownerUserId").equals(owner).count() === 0 && await preparationGuard(owner);
}
function row(key: string, data: unknown): MetaRow {
  const value = JSON.stringify(data);
  if (new TextEncoder().encode(value).length > 1900000) throw new Error("План слишком большой для сохранения");
  return { key, value, updatedAt: Date.now() };
}
export async function saveOfflineWorkoutContext(owner: string, input: unknown, rawProfile: unknown, exercises: Exercise[], hints: WorkoutLoadHint[], requireReady = false): Promise<void> {
  checkOwner(owner);
  const bundle = offlineWorkoutContextSchema.parse(input);
  const profile = profileSchema.parse(rawProfile);
  if (bundle.owner !== owner || profile.id !== owner || String(profile.goals.active_program_id || "") !== (bundle.program?.id || "")) throw new Error("Программа изменилась. Повторите подготовку");
  const root = prefix(owner);
  const rows = bundle.plans.map((plan, i) => row(`${root}plan:${i}`, plan));
  await db.transaction("rw", db.tables, async () => {
    checkOwner(owner);
    if (requireReady && !await canPrepareOfflineWorkoutContext(owner)) throw new Error("Сначала отправьте сохранённые изменения");
    const completedWorkoutIds = await db.workouts.where("user_id").equals(owner).filter(workout => workout.status === "completed").primaryKeys();
    const header = row(`${root}header`, { bundle: { ...bundle, plans: undefined }, profile, completedWorkoutIds, planKeys: rows.map(item => item.key) });
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
export async function readOfflineWorkoutContext(owner: string, day: string, source: Dexie = db): Promise<OfflineWorkoutContext | null> {
  if (currentOwner() !== owner) return null;
  const meta = source.table<MetaRow>("meta");
  const workouts = source.table<Workout>("workouts");
  return source.transaction("r", meta, workouts, async () => {
    const saved = await meta.get(`${prefix(owner)}header`);
    if (!saved) return null;
    const header = headerSchema.parse(JSON.parse(saved.value));
    if (header.bundle.owner !== owner || header.profile.id !== owner) return null;
    const date = header.bundle.days.find(item => item.requested_date === day);
    if (!date) return null;
    const rows = await meta.bulkGet(header.planKeys);
    if (rows.some(item => !item)) return null;
    const plans = rows.map(item => preparedProgramPlanSchema.parse(JSON.parse(item!.value)));
    if (currentOwner() !== owner) return null;
    const local = await workouts.where("user_id").equals(owner).toArray();
    const program = header.bundle.program;
    const goals = program ? overlayOfflineProgramProgress(header.profile.goals, program, local, header.completedWorkoutIds, day, owner) : header.profile.goals;
    const schedule = structuredClone(date.schedule);
    if (program) {
      const completedToday = local.some(row => row.program_id === program.id && row.status === "completed" && row.scheduled_date === schedule.current?.target_date);
      if (schedule.current && completedToday) schedule.current.status = "completed";
      if (schedule.current?.status === "scheduled" || schedule.current?.status === "missed") schedule.current.day_index = Number(goals.active_program_next_day) || schedule.current.day_index;
      if (schedule.next?.status === "scheduled") schedule.next.day_index = Number(goals.active_program_next_day) || schedule.next.day_index;
    }
    const recovery = goals.workout_illness_recovery;
    const afterRecovery = plans.some(row => row.after_recovery) && !(recovery && typeof recovery === "object" && (recovery as Record<string, unknown>).light_cycle_active === true);
    const effectivePlans = plans.filter(row => row.after_recovery === afterRecovery);
    return { program, profile: { ...header.profile, goals }, schedule, plans: effectivePlans, preparedAt: header.bundle.prepared_at, scheduleFingerprint: header.bundle.schedule_fingerprint };
  });
}
const running = new Map<string, Promise<{ preparedAt: string }>>();
export function prepareOfflineWorkoutContext(owner: string, start: string): Promise<{ preparedAt: string }> {
  const key = `${owner}:${start}`;
  const existing = running.get(key);
  if (existing) return existing;
  const task = (async () => {
    checkOwner(owner);
    if (!await canPrepareOfflineWorkoutContext(owner)) throw new Error("Сначала отправьте сохранённые изменения");
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
    await saveOfflineWorkoutContext(owner, bundle, profile, exercises, hints, true);
    return { preparedAt: bundle.prepared_at };
  })().finally(() => running.delete(key));
  running.set(key, task);
  return task;
}
