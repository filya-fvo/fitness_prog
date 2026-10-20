import { fetchPlannedWorkoutPlan, type PlannedWorkoutPlanInput } from "@/api/workouts";
import { fetchWorkoutCustomization, resetWorkoutCustomization, type WorkoutCustomizationContext, type WorkoutCustomizationWrite } from "@/api/workoutCustomization";
import { invalidateOfflineWorkoutContext } from "@/db/offlineWorkoutContext";
import { useUserStore } from "@/store/userStore";
import type { WorkoutPlan } from "@/types/workout";
import { buildWorkoutDayPatch } from "@/utils/workoutCustomization";

type Scope = "program_day" | "occurrence";
function contextFor(context: PlannedWorkoutPlanInput, scope: Scope): WorkoutCustomizationContext {
  return { program_id: context.programId, day_index: context.dayIndex, scope,
    scheduled_date: scope === "occurrence" ? context.scheduledDate : null };
}
function checkOwner(owner: string | undefined): void {
  if (useUserStore.getState().user?.id !== owner) throw new Error("Аккаунт изменился. Откройте подготовку снова");
}
export async function invalidatePreparedWorkoutCache(owner: string | undefined, programId: string): Promise<string | null> {
  if (!owner || useUserStore.getState().user?.id !== owner) return null;
  try { await invalidateOfflineWorkoutContext(owner, programId); return null; }
  catch {
    console.warn("Подготовка сохранена; сохранённые планы нужно обновить при подключении");
    return "Изменения сохранены. Откройте план с интернетом перед следующей тренировкой без сети";
  }
}
export async function buildPreparedWorkoutChange(context: PlannedWorkoutPlanInput, loaded: WorkoutPlan, edited: WorkoutPlan, scope: Scope, operationId: string, programVersion?: number): Promise<WorkoutCustomizationWrite> {
  const owner = useUserStore.getState().user?.id;
  const input = contextFor(context, scope);
  const [base, stored, occurrence] = await Promise.all([
    fetchPlannedWorkoutPlan({ ...context, includeSavedOverride: false, includePersonalOverride: scope !== "program_day" }),
    fetchWorkoutCustomization(input),
    scope === "program_day" ? fetchWorkoutCustomization(contextFor(context, "occurrence")) : Promise.resolve(null),
  ]);
  checkOwner(owner);
  if (programVersion !== undefined && stored.program_version !== programVersion) throw new Error("Программа изменилась. Подготовка сохранена на устройстве");
  if (stored.revision !== (loaded.customization_revisions?.[scope] ?? 0)) throw new Error("План уже изменён. Откройте подготовку снова");
  if (scope === "occurrence" && (base.customization_revisions?.program_day ?? 0) !== (loaded.customization_revisions?.program_day ?? 0)) throw new Error("Личный план уже изменён. Откройте подготовку снова");
  if (occurrence && occurrence.revision !== (loaded.customization_revisions?.occurrence ?? 0)) throw new Error("Разовая подготовка уже изменилась. Откройте её снова");
  const patch = buildWorkoutDayPatch(base, edited, { loaded, sources: occurrence ? [stored.patch, occurrence.patch] : [stored.patch] });
  return { ...input, base_revision: stored.revision, operation_id: operationId, patch,
    base_program_day_revision: loaded.customization_revisions?.program_day ?? 0,
    ...(occurrence ? { promote_date: context.scheduledDate, base_occurrence_revision: occurrence.revision } : {}),
  };
}
export async function resetPreparedWorkoutChanges(context: PlannedWorkoutPlanInput, loaded: WorkoutPlan, scope: Scope): Promise<string | null> {
  const owner = useUserStore.getState().user?.id;
  await resetWorkoutCustomization({ ...contextFor(context, scope), base_revision: loaded.customization_revisions?.[scope] ?? 0,
    base_program_day_revision: loaded.customization_revisions?.program_day ?? 0, operation_id: crypto.randomUUID() });
  return invalidatePreparedWorkoutCache(owner, context.programId);
}
