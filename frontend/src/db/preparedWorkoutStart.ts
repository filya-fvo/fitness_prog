/** Resolve only the acknowledged personal proposal before its dependent create. */
import { db, type SyncQueueItem } from "./schema";
import { readWorkoutPreparationDraft } from "./workoutCustomization";
import { fetchOfflineWorkoutContext } from "@/api/offlineWorkouts";
import type { createWorkout } from "@/api/workouts";
import { executionSnapshotKey } from "@/utils/workoutExecutionState";
import { useUserStore } from "@/store/userStore";
import type { WorkoutPlan } from "@/types/workout";
export type PreparedCreatePayload = Parameters<typeof createWorkout>[0] & { preparationDraftKey?: string | null; preparationReconciled?: boolean };
function content(plan: WorkoutPlan): string {
  return JSON.stringify([executionSnapshotKey({ ...plan, execution_version: 2, customization_revisions: {} }),
    [...plan.exercises].sort((a, b) => a.order - b.order).map(row => row.note ?? null)]);
}
function checkOwner(owner: string) { if (useUserStore.getState().user?.id !== owner) throw new Error("Аккаунт изменился. Результат сохранён на устройстве"); }
export async function reconcilePreparedCreate(item: SyncQueueItem, owner: string): Promise<PreparedCreatePayload> {
  const payload = item.payload as PreparedCreatePayload;
  if (!payload.preparationDraftKey || payload.preparationReconciled) return payload;
  const draft = await readWorkoutPreparationDraft(payload.preparationDraftKey, owner);
  if (!draft?.receipt || !payload.preparation || !payload.plan) throw new Error("Сначала отправьте сохранённую подготовку. Результат остался на устройстве");
  if (draft.owner !== owner || draft.context.programId !== payload.programId || draft.context.dayIndex !== payload.dayIndex || draft.context.scheduledDate !== payload.scheduledDate || draft.context.weekPhase !== payload.weekPhase)
    throw new Error("Подготовка не совпадает с тренировкой. Результат остался на устройстве");
  const bundle = await fetchOfflineWorkoutContext(payload.scheduledDate, 1);
  checkOwner(owner);
  if (bundle.owner !== owner || bundle.program?.id !== payload.programId || bundle.program.version !== draft.programVersion || bundle.schedule_fingerprint !== payload.preparation.schedule_fingerprint)
    throw new Error("Программа или расписание изменились. Результат остался на устройстве");
  const expected = bundle.plans.find(row => row.scheduled_date === payload.scheduledDate && row.day_index === payload.dayIndex && row.week_phase === payload.weekPhase && row.readiness === (payload.cycleReadiness ?? "normal") && !row.after_recovery);
  const revisions = { ...draft.loaded.customization_revisions, [draft.scope]: draft.receipt.revision };
  if (draft.scope === "program_day" && draft.loaded.customization_scopes?.includes("occurrence")) revisions.occurrence = (revisions.occurrence ?? 0) + 1;
  if (!expected?.preparation_fingerprint || content(expected.plan as WorkoutPlan) !== content(payload.plan) ||
      ["program_day", "occurrence"].some(scope => (expected.plan.customization_revisions?.[scope] ?? 0) !== (revisions[scope] ?? 0)))
    throw new Error("Личный план изменился после подготовки. Результат остался на устройстве");
  const next: PreparedCreatePayload = { ...payload, plan: expected.plan as WorkoutPlan, preparation: { ...payload.preparation, plan_fingerprint: expected.preparation_fingerprint }, preparationReconciled: true };
  await db.transaction("rw", db.syncQueue, async () => { checkOwner(owner); await db.syncQueue.update(item.id, { payload: next }); checkOwner(owner); });
  return next;
}
/** Wall-clock changes cannot place facts before create or create before its proposal. */
export function orderWorkoutQueue(items: SyncQueueItem[]): SyncQueueItem[] {
  const creates = new Map(items.filter(item => item.type === "create_workout").map(item => [item.clientWorkoutId, item]));
  const preparations = new Map(items.filter(item => item.type === "customize_workout").map(item => [item.payload.draftKey, item]));
  const seen = new Set<string>(), ordered: SyncQueueItem[] = [];
  const visit = (item: SyncQueueItem) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    const dependency = item.type === "create_workout" ? preparations.get(item.payload.preparationDraftKey) : creates.get(item.clientWorkoutId);
    if (dependency && dependency.id !== item.id) visit(dependency);
    ordered.push(item);
  };
  items.forEach(visit);
  return ordered;
}
