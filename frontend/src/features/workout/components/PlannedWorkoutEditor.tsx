import { loadWorkoutPreparation, findWorkoutPreparation, stageWorkoutPreparation, readWorkoutPreparationDraft, readWorkoutPreparationFailure, guardWorkoutPreparationReset, clearAcknowledgedWorkoutPreparation } from "@/db/workoutCustomization";
import { useUserStore } from "@/store/userStore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getStoredToken } from "@/api/client";
import { fetchExerciseCatalog } from "@/api/exercises";
import { fetchPlannedWorkoutPlan, savePlannedWorkoutPlan, type PlannedWorkoutPlanInput } from "@/api/workouts";
import { cacheExercises, readCachedExercises, flushSyncQueue } from "@/db/syncQueue";
import { ExerciseDetailModal } from "./ExerciseDetailModal";
import { PlannedExercisePicker } from "./PlannedExercisePicker";
import { replacePreparedExercise, workoutPreparationError } from "@/utils/workoutMethods";
import { inferLoadType, defaultTimedSeconds } from "@/utils/exerciseLoadType";
import { WorkoutDayComposer } from "./WorkoutDayComposer";
import { WorkoutCustomizationScope } from "./WorkoutCustomizationScope";
import { resetPreparedWorkoutChanges } from "../services/workoutCustomizationActions";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import { toast } from "@/store/toastStore";
import type { Exercise, WorkoutPlan } from "@/types/workout";
import { toUserMessage } from "@/utils/errors";
import { isOnline } from "@/utils/network";

type Props = PlannedWorkoutPlanInput & { disabled?: boolean };
function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(`${value}T12:00:00`));
}

export function PlannedWorkoutEditor(props: Props) {
  const owner = useUserStore(state => state.user?.id);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pendingGroup, setPendingGroup] = useState(false);
  const [structuralEdit, setStructuralEdit] = useState(false);
  const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<"occurrence" | "program_day">("occurrence");
  const loadedPlan = useRef<WorkoutPlan | null>(null);
  const generation = useRef(0);
  const openedContext = useRef<PlannedWorkoutPlanInput>(props);
  const close = useCallback(() => {
    generation.current += 1;
    setPendingGroup(false); setOpen(false); setLoading(false); setSaving(false); setAdding(false); setEditingId(null); setDetailExercise(null);
  }, []);
  useEffect(close, [close, props.programId, props.dayIndex, props.scheduledDate, props.weekPhase, owner]);
  const dialogRef = useModalAccessibility(open, close);
  const byId = useMemo(() => new Map(catalog.map(row => [row.id, row])), [catalog]);
  const editingItem = plan?.exercises.find(row => row.exercise_id === editingId);
  const source = editingItem ? byId.get(editingItem.exercise_id) ?? null : null;
  const occupiedIds = useMemo(() => new Set((plan?.exercises || []).map(row => row.exercise_id)), [plan]);

  async function showEditor() {
    if (loading || props.disabled) return;
    const current = ++generation.current;
    openedContext.current = { ...props };
    setOpen(true); setLoading(true); setError(null); setPlan(null); setStructuralEdit(false); setScope("occurrence");
    try {
      const cached = await readCachedExercises();
      if (current !== generation.current) return;
      if (cached.length) setCatalog(cached);
      const [prepared, fresh, pending] = await Promise.all([
        loadWorkoutPreparation(openedContext.current),
        isOnline() && getStoredToken() ? fetchExerciseCatalog().catch(() => null) : Promise.resolve(null),
        findWorkoutPreparation(openedContext.current),
      ]);
      if (current !== generation.current) return;
      setPlan(prepared); loadedPlan.current = prepared;
      if (pending && !pending.receipt) { setScope(pending.scope); setStructuralEdit(true); }
      if (fresh === null && !cached.length) setError("Не удалось загрузить каталог упражнений. Откройте подготовку снова");
      if (fresh?.length) { setCatalog(fresh); await cacheExercises(fresh); }
    } catch (err) {
      if (current === generation.current) setError(toUserMessage(err, "Не удалось загрузить план тренировки"));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }

  function choose(exercise: Exercise) {
    if (!plan) return;
    if (adding) {
      if (occupiedIds.has(exercise.id) || plan.exercises.length >= 20) return;
      setPlan({ ...plan, exercises: [...plan.exercises, {
        exercise_id: exercise.id, name_ru: exercise.name_ru, order: plan.exercises.length + 1,
        target_sets: 3, target_reps: ["timed", "cardio_machine"].includes(inferLoadType(exercise)) ? `${defaultTimedSeconds(exercise)} с` : null, rest_sec: null,
      }] });
      setStructuralEdit(true);
    } else if (editingId) {
      try { setPlan(replacePreparedExercise(plan, editingId, exercise)); }
      catch (err) { setError(toUserMessage(err, "Не удалось заменить упражнение")); return; }
    }
    setAdding(false); setEditingId(null);
  }

  function restoreDefaults() {
    if (!plan) return;
    try {
      let restored = plan;
      for (const row of plan.exercises) if (row.original_exercise_id) {
        const original = byId.get(row.original_exercise_id);
        if (!original) throw new Error("Загрузите каталог заново, чтобы вернуть упражнение программы");
        restored = replacePreparedExercise(restored, row.exercise_id, original, true);
      }
      setPlan(restored);
    } catch (err) { setError(toUserMessage(err, "Не удалось вернуть упражнения программы")); }
  }

  async function save() {
    if (!plan || saving || pendingGroup || workoutPreparationError(plan)) return;
    const current = generation.current;
    const context = openedContext.current;
    setSaving(true); setError(null);
    try {
      if (scope === "program_day" || structuralEdit || plan.execution_version === 2 || Object.keys(plan.customization_revisions ?? {}).length > 0 || !isOnline()) {
        const pending = await stageWorkoutPreparation(context, loadedPlan.current ?? plan, plan, scope);
        if (isOnline() && getStoredToken() && owner) {
          const result = await flushSyncQueue(owner, { retryFailed: true });
          const draft = await readWorkoutPreparationDraft(pending.key, owner);
          if (!draft?.receipt && result.failed) throw new Error(await readWorkoutPreparationFailure(pending.operationId, owner) ?? "Подготовка сохранена на устройстве. Отправка пока не завершена");
          if (!draft?.receipt) { if (current === generation.current) { close(); toast("Подготовка сохранена на устройстве и ожидает отправки"); } return; }
        } else { if (current === generation.current) { close(); toast("Подготовка сохранена на устройстве и будет отправлена при подключении"); } return; }
      } else {
        const replacements = plan.exercises.flatMap(row => row.original_exercise_id && row.original_exercise_id !== row.exercise_id
          ? [{ fromExerciseId: row.original_exercise_id, toExerciseId: row.exercise_id }] : []);
        await savePlannedWorkoutPlan({ ...context, replacements });
      }
      if (current === generation.current) { close(); toast("Подготовка сохранена"); }
    } catch (err) {
      if (current === generation.current) setError(toUserMessage(err, "Не удалось сохранить подготовку"));
    } finally {
      if (current === generation.current) setSaving(false);
    }
  }

  async function resetScope(value: "occurrence" | "program_day") {
    if (!plan || saving) return;
    const current = generation.current;
    const context = openedContext.current;
    let saved = false;
    setSaving(true); setError(null);
    try {
      await guardWorkoutPreparationReset(context);
      const warning = await resetPreparedWorkoutChanges(context, loadedPlan.current ?? plan, value);
      if (warning && current === generation.current) toast(warning, "error", 7000);
      saved = true;
      await clearAcknowledgedWorkoutPreparation(context);
      if (current !== generation.current) return;
      setPlan(null); setLoading(true);
      const fresh = await fetchPlannedWorkoutPlan(context);
      if (current !== generation.current) return;
      loadedPlan.current = fresh; setPlan(fresh); setStructuralEdit(false);
      toast(value === "program_day" ? "Личные изменения дня сброшены" : "Подготовка этой даты сброшена");
    } catch (err) {
      if (current === generation.current) setError(saved ? "Изменения сброшены. Откройте подготовку снова, чтобы обновить план" : toUserMessage(err, "Не удалось сбросить изменения"));
    } finally {
      if (current === generation.current) { setSaving(false); setLoading(false); }
    }
  }

  const picking = adding || editingId !== null;
  return <>
    <button type="button" disabled={props.disabled} onClick={() => void showEditor()} className="app-button app-secondary-action mt-2 w-full">
      Подготовить упражнения · {formatDate(props.scheduledDate)}
    </button>
    {open ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 sm:items-center">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="planned-workout-editor-title" tabIndex={-1} className="app-card flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-black/5 px-4 py-3">
          <div><h3 id="planned-workout-editor-title" className="font-semibold">Подготовка тренировки</h3>{plan?.customization_scopes?.includes("program_day") ? <p className="mt-1 text-xs text-tg-link">Изменено для вас</p> : null}<p className="mt-1 text-xs text-tg-hint">{scope === "program_day" ? "Для моих следующих тренировок этого дня" : `Изменения применятся ${formatDate(props.scheduledDate)} при старте.`}</p></div>
          <button type="button" aria-label="Закрыть" onClick={close} className="min-h-[44px] min-w-[44px] text-tg-hint">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? <p className="text-sm text-tg-hint">Загрузка плана…</p> : null}
          {error ? <p role="alert" className="app-status app-status-danger text-sm">{error}</p> : null}
          {plan && !picking ? <WorkoutCustomizationScope value={scope} activeScopes={plan.customization_scopes} disabled={saving || pendingGroup} onChange={setScope} onReset={value => void resetScope(value)} /> : null}
          {picking ? <PlannedExercisePicker key={adding ? "add" : editingId} source={adding ? null : source} catalog={editingItem?.set_methods?.length ? catalog.filter(item => inferLoadType(item) === "weight_reps") : catalog} occupiedIds={occupiedIds}
            onBack={() => { setAdding(false); setEditingId(null); }} onChoose={choose} onOpenDetail={setDetailExercise} />
            : plan ? <WorkoutDayComposer plan={plan} catalog={catalog} disabled={saving}
              onPendingChange={setPendingGroup} onChange={next => { setPlan(next); setStructuralEdit(true); }} onAdd={() => setAdding(true)} onReplace={row => setEditingId(row.exercise_id)} onOpenDetail={setDetailExercise} /> : null}
        </div>
        {plan && !picking ? <div className="space-y-2 border-t border-black/5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button type="button" disabled={saving || pendingGroup || Boolean(workoutPreparationError(plan))} onClick={() => void save()} className="app-button app-gradient-action min-h-[48px] w-full">{saving ? "Сохраняем…" : "Сохранить подготовку"}</button>
          {plan.exercises.some(row => row.original_exercise_id) ? <button type="button" disabled={saving} onClick={restoreDefaults} className="min-h-[44px] w-full text-xs text-tg-hint">Вернуть упражнения программы</button> : null}
        </div> : null}
      </div>
    </div> : null}
    {detailExercise ? <ExerciseDetailModal exercise={detailExercise} onClose={() => setDetailExercise(null)} /> : null}
  </>;
}
