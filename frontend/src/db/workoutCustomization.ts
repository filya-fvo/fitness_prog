/** Durable proposals are separate from the immutable plan of a started workout. */
import { z } from "zod";
import { db } from "./schema";
import { readOfflineWorkoutContext } from "./offlineWorkoutContext";
import { fetchPlannedWorkoutPlan, workoutPlanSchema, type PlannedWorkoutPlanInput } from "@/api/workouts";
import { fetchWorkoutCustomization, saveWorkoutCustomization, workoutCustomizationSchema, workoutDayPatchSchema } from "@/api/workoutCustomization";
import { buildPreparedWorkoutChange, invalidatePreparedWorkoutCache } from "@/features/workout/services/workoutCustomizationActions";
import { useUserStore } from "@/store/userStore";
import { isOnline } from "@/utils/network";
import type { WorkoutPlan } from "@/types/workout";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const contextSchema = z.object({ programId: z.string().uuid(), scheduledDate: day, dayIndex: z.number().int().min(1).max(7), weekPhase: z.enum(["light", "medium", "heavy"]).nullable().optional() });
const requestSchema = z.object({ program_id: z.string().uuid(), day_index: z.number().int().min(1).max(7), scope: z.enum(["occurrence", "program_day"]), scheduled_date: day.nullable().optional(),
  base_revision: z.number().int().nonnegative(), operation_id: z.string().uuid(), patch: workoutDayPatchSchema,
  base_program_day_revision: z.number().int().nonnegative().optional(), promote_date: day.optional(), base_occurrence_revision: z.number().int().nonnegative().optional() });
const cacheSchema = z.object({ context: contextSchema, loaded: workoutPlanSchema, programVersion: z.number().int().positive() });
const draftSchema = cacheSchema.extend({ version: z.literal(1), owner: z.string().uuid(), operationId: z.string().uuid(), scope: z.enum(["occurrence", "program_day"]), edited: workoutPlanSchema,
  request: requestSchema.nullable(), receipt: workoutCustomizationSchema.nullable() });
export type WorkoutPreparationDraft = z.infer<typeof draftSchema>;
const prefix = (owner: string) => `workout-preparation:v1:${owner}:`;
const dayKey = (owner: string, context: PlannedWorkoutPlanInput) => `${prefix(owner)}day:${context.programId}:${context.dayIndex}`;
const occurrenceKey = (owner: string, context: PlannedWorkoutPlanInput) => `${dayKey(owner, context)}:${context.scheduledDate}`;
const cacheKey = (owner: string, context: PlannedWorkoutPlanInput) => `${prefix(owner)}cache:${context.programId}:${context.dayIndex}:${context.scheduledDate}:${context.weekPhase ?? "auto"}`;
function checkOwner(owner: string): void { if (useUserStore.getState().user?.id !== owner) throw new Error("Аккаунт изменился. Откройте подготовку снова"); }
function requireOwner(): string { const owner = useUserStore.getState().user?.id; if (!owner) throw new Error("Войдите в аккаунт"); return owner; }
export function sameWorkoutPreparationContext(a: PlannedWorkoutPlanInput, b: PlannedWorkoutPlanInput): boolean {
  return a.programId === b.programId && a.dayIndex === b.dayIndex && a.scheduledDate === b.scheduledDate && (a.weekPhase ?? null) === (b.weekPhase ?? null);
}
function row(key: string, data: unknown) {
  const value = JSON.stringify(data);
  if (new TextEncoder().encode(value).length > 1900000) throw new Error("Подготовка слишком большая для сохранения");
  return { key, value, updatedAt: Date.now() };
}
export async function readWorkoutPreparationDraft(key: string, owner: string): Promise<WorkoutPreparationDraft | null> {
  checkOwner(owner);
  if (!key.startsWith(`${prefix(owner)}op:`)) throw new Error("Подготовка принадлежит другому аккаунту");
  const saved = await db.meta.get(key);
  checkOwner(owner);
  if (!saved) return null;
  const draft = draftSchema.parse(JSON.parse(saved.value));
  if (draft.owner !== owner) throw new Error("Подготовка принадлежит другому аккаунту");
  return draft;
}
async function indexedDraft(owner: string, index: { value: string } | undefined) {
  checkOwner(owner);
  return index ? readWorkoutPreparationDraft(z.string().parse(JSON.parse(index.value)), owner) : null;
}
async function currentDraft(owner: string, context: PlannedWorkoutPlanInput) {
  const [day, date] = await db.meta.bulkGet([dayKey(owner, context), occurrenceKey(owner, context)]);
  const shared = await indexedDraft(owner, day);
  if (shared?.scope === "program_day" && !shared.receipt) return shared;
  const occurrence = await indexedDraft(owner, date);
  // Older clients indexed both scopes by program day. Keep pending and acknowledged records usable.
  const legacy = shared?.context.scheduledDate === context.scheduledDate ? shared : null;
  return legacy && !legacy.receipt ? legacy : occurrence ?? legacy;
}
async function checkPendingDay(owner: string, context: PlannedWorkoutPlanInput): Promise<void> {
  const key = dayKey(owner, context);
  const indexes = await db.meta.where("key").startsWith(key).filter(index => index.key === key || index.key.startsWith(`${key}:`)).toArray();
  for (const index of indexes) {
    const draft = await indexedDraft(owner, index);
    if (draft && !draft.receipt) throw new Error("Сначала отправьте сохранённую подготовку этого дня");
  }
}
async function enqueueWorkoutPreparation(draft: WorkoutPreparationDraft, key: string): Promise<void> {
  if (await db.syncQueue.get(draft.operationId)) return;
  await db.syncQueue.add({ id: draft.operationId, ownerUserId: draft.owner, type: "customize_workout",
    clientWorkoutId: `customization:${draft.context.programId}:${draft.context.dayIndex}`,
    payload: { draftKey: key, executionVersion: 2 }, createdAt: Date.now(), attempts: 0, lastError: null });
}
export async function requeueWorkoutPreparation(operationId: string, owner: string): Promise<string> {
  const key = `${prefix(owner)}op:${operationId}`;
  await db.transaction("rw", db.meta, db.syncQueue, async () => {
    const draft = await readWorkoutPreparationDraft(key, owner);
    if (!draft || draft.operationId !== operationId) throw new Error("Сохранённая подготовка не найдена");
    if (!draft.receipt) await enqueueWorkoutPreparation(draft, key);
    checkOwner(owner);
  });
  return key;
}
export async function findWorkoutPreparation(context: PlannedWorkoutPlanInput): Promise<WorkoutPreparationDraft | null> {
  return currentDraft(requireOwner(), context);
}
export async function loadWorkoutPreparation(context: PlannedWorkoutPlanInput): Promise<WorkoutPlan> {
  const owner = requireOwner();
  const draft = await currentDraft(owner, context);
  if (draft && sameWorkoutPreparationContext(draft.context, context) && (!draft.receipt || !isOnline())) return draft.edited as WorkoutPlan;
  if (isOnline()) {
    const [loaded, stored] = await Promise.all([fetchPlannedWorkoutPlan(context), fetchWorkoutCustomization({ program_id: context.programId, day_index: context.dayIndex, scope: "program_day" })]);
    checkOwner(owner);
    await db.transaction("rw", db.meta, async () => { checkOwner(owner); await db.meta.put(row(cacheKey(owner, context), { context, loaded, programVersion: stored.program_version })); checkOwner(owner); });
    return loaded;
  }
  const cached = await db.meta.get(cacheKey(owner, context));
  checkOwner(owner);
  if (cached) return cacheSchema.parse(JSON.parse(cached.value)).loaded as WorkoutPlan;
  const bundle = await readOfflineWorkoutContext(owner, context.scheduledDate);
  checkOwner(owner);
  const prepared = bundle?.program?.id === context.programId ? bundle.plans.find(item => item.scheduled_date === context.scheduledDate && item.day_index === context.dayIndex && item.readiness === "normal" && (!context.weekPhase || item.week_phase === context.weekPhase)) : null;
  if (!prepared || !bundle?.program) throw new Error("Откройте этот день с интернетом, чтобы подготовить его без сети");
  await db.transaction("rw", db.meta, async () => { checkOwner(owner); await db.meta.put(row(cacheKey(owner, context), { context, loaded: prepared.plan, programVersion: bundle.program!.version ?? 1 })); checkOwner(owner); });
  return prepared.plan as WorkoutPlan;
}
export async function stageWorkoutPreparation(context: PlannedWorkoutPlanInput, loaded: WorkoutPlan, edited: WorkoutPlan, scope: "occurrence" | "program_day"): Promise<{ key: string; operationId: string }> {
  const owner = requireOwner();
  let operationId: string = crypto.randomUUID();
  let key = `${prefix(owner)}op:${operationId}`;
  await db.transaction("rw", db.meta, db.syncQueue, async () => {
    checkOwner(owner);
    const previous = await currentDraft(owner, context);
    if (previous && !previous.receipt) {
      if (!sameWorkoutPreparationContext(previous.context, context) || previous.scope !== scope || JSON.stringify(previous.edited) !== JSON.stringify(workoutPlanSchema.parse(edited))) throw new Error("Сначала отправьте сохранённую подготовку этого дня");
      operationId = previous.operationId; key = `${prefix(owner)}op:${operationId}`;
      await enqueueWorkoutPreparation(previous, key);
      checkOwner(owner);
      return;
    }
    if (scope === "program_day") await checkPendingDay(owner, context);
    const cached = await db.meta.get(cacheKey(owner, context));
    checkOwner(owner);
    if (!cached) throw new Error("Откройте подготовку заново перед сохранением");
    const base = cacheSchema.parse(JSON.parse(cached.value));
    if (JSON.stringify(base.loaded) !== JSON.stringify(workoutPlanSchema.parse(loaded))) throw new Error("План изменился. Откройте подготовку снова");
    const draft = draftSchema.parse({ ...base, version: 1, owner, context, operationId, scope, edited, request: null, receipt: null });
    const index = scope === "occurrence" ? occurrenceKey(owner, context) : dayKey(owner, context);
    await db.meta.bulkPut([row(key, draft), row(index, key)]);
    await enqueueWorkoutPreparation(draft, key);
    checkOwner(owner);
  });
  return { key, operationId };
}
export async function syncWorkoutPreparation(key: string, owner: string): Promise<string | null> {
  let draft = await readWorkoutPreparationDraft(key, owner);
  if (!draft) throw new Error("Сохранённая подготовка не найдена");
  if (draft.receipt) return null;
  if (!draft.request) {
    const request = await buildPreparedWorkoutChange(draft.context, draft.loaded as WorkoutPlan, draft.edited as WorkoutPlan, draft.scope, draft.operationId, draft.programVersion);
    checkOwner(owner);
    await db.transaction("rw", db.meta, async () => {
      const latest = await readWorkoutPreparationDraft(key, owner);
      if (!latest || latest.operationId !== draft!.operationId) throw new Error("Подготовка изменилась. Откройте её снова");
      // Concurrent tabs may have already persisted an identical operation request.
      if (!latest.request) await db.meta.put(row(key, { ...latest, request }));
      checkOwner(owner);
    });
    draft = (await readWorkoutPreparationDraft(key, owner))!;
  }
  checkOwner(owner);
  const receipt = await saveWorkoutCustomization(draft.request!);
  checkOwner(owner);
  await db.transaction("rw", db.meta, async () => { checkOwner(owner); await db.meta.put(row(key, { ...draft, receipt })); checkOwner(owner); });
  return invalidatePreparedWorkoutCache(owner, draft.context.programId);
}


export async function guardWorkoutPreparationReset(context: PlannedWorkoutPlanInput, scope: WorkoutPreparationDraft["scope"] = "occurrence"): Promise<void> {
  const owner = requireOwner();
  if (scope === "program_day") return checkPendingDay(owner, context);
  const draft = await currentDraft(owner, context);
  if (draft && !draft.receipt) throw new Error("Сначала отправьте сохранённую подготовку этого дня");
}
export async function clearAcknowledgedWorkoutPreparation(context: PlannedWorkoutPlanInput, scope: WorkoutPreparationDraft["scope"] = "occurrence"): Promise<void> {
  const owner = requireOwner();
  await db.transaction("rw", db.meta, async () => {
    checkOwner(owner);
    await guardWorkoutPreparationReset(context, scope);
    const day = dayKey(owner, context);
    const legacy = await indexedDraft(owner, await db.meta.get(day));
    const date = occurrenceKey(owner, context);
    const previews = `${prefix(owner)}cache:${context.programId}:${context.dayIndex}:`;
    const keys = scope === "program_day"
      ? [...await db.meta.where("key").startsWith(previews).primaryKeys(), ...await db.meta.where("key").startsWith(`${day}:`).primaryKeys(), day]
      : [...await db.meta.where("key").startsWith(`${previews}${context.scheduledDate}:`).primaryKeys(), date];
    if (scope === "occurrence" && legacy?.context.scheduledDate === context.scheduledDate) keys.push(day);
    await db.meta.bulkDelete(keys);
    checkOwner(owner);
  });
}


export async function readWorkoutPreparationFailure(operationId: string, owner: string): Promise<string | null> {
  checkOwner(owner);
  const queued = await db.syncQueue.get(operationId);
  checkOwner(owner);
  if (!queued || queued.ownerUserId !== owner || queued.type !== "customize_workout") return null;
  return queued.lastError;
}

export async function listPendingWorkoutPreparations(owner: string): Promise<Array<{ operationId: string; scheduledDate: string; dayIndex: number }>> {
  checkOwner(owner);
  const items = await db.syncQueue.where("ownerUserId").equals(owner).filter(item => item.type === "customize_workout").sortBy("createdAt");
  const results: Array<{ operationId: string; scheduledDate: string; dayIndex: number }> = [];
  for (const item of items) {
    if (typeof item.payload.draftKey !== "string") continue;
    const draft = await readWorkoutPreparationDraft(item.payload.draftKey, owner);
    if (draft && draft.operationId === item.id && !draft.receipt)
      results.push({ operationId: item.id, scheduledDate: draft.context.scheduledDate, dayIndex: draft.context.dayIndex });
  }
  checkOwner(owner);
  return results;
}

/** Cancel only a proposal that has never been sent and has no dependent workout. */
export async function cancelUnsentWorkoutPreparation(operationId: string, owner: string): Promise<void> {
  checkOwner(owner);
  await db.transaction("rw", db.meta, db.syncQueue, async () => {
    checkOwner(owner);
    const queued = await db.syncQueue.get(operationId);
    const key = `${prefix(owner)}op:${operationId}`;
    if (queued && (queued.ownerUserId !== owner || queued.type !== "customize_workout" || queued.payload.draftKey !== key))
      throw new Error("Изменение не найдено. Обновите экран");
    const draft = await readWorkoutPreparationDraft(key, owner);
    if (!draft || draft.operationId !== operationId) throw new Error("Подготовка не найдена. Изменения сохранены");
    if (draft.request || draft.receipt) throw new Error("Отменить нельзя: изменение уже отправлялось. Повторите синхронизацию");
    const dependent = await db.syncQueue.where("ownerUserId").equals(owner)
      .filter(item => item.type === "create_workout" && item.payload.preparationDraftKey === key).first();
    if (dependent) throw new Error("С этой подготовкой сохранена тренировка. Сначала синхронизируйте её");
    const indexes = await db.meta.bulkGet([dayKey(owner, draft.context), occurrenceKey(owner, draft.context)]);
    const ownedIndexes = indexes.flatMap(index => index && JSON.parse(index.value) === key ? [index.key] : []);
    const previews = `${prefix(owner)}cache:${draft.context.programId}:${draft.context.dayIndex}:`;
    const previewKeys = await db.meta.where("key").startsWith(draft.scope === "occurrence" ? `${previews}${draft.context.scheduledDate}:` : previews).primaryKeys();
    await db.meta.bulkDelete([key, ...previewKeys, ...ownedIndexes]);
    await db.syncQueue.delete(operationId);
    checkOwner(owner);
  });
  if (typeof window !== "undefined") window.dispatchEvent(new Event("fitness:sync-complete"));
}
