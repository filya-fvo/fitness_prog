import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getStoredToken } from "@/api/client";
import { fetchExerciseCatalog } from "@/api/exercises";
import { fetchPlannedWorkoutPlan, savePlannedWorkoutPlan, type PlannedWorkoutPlanInput } from "@/api/workouts";
import { fetchWorkoutCustomization, saveWorkoutCustomization } from "@/api/workoutCustomization";
import { cacheExercises, readCachedExercises } from "@/db/syncQueue";
import { ExerciseDetailModal } from "./ExerciseDetailModal";
import { PlannedExercisePicker } from "./PlannedExercisePicker";
import { WorkoutDayComposer } from "./WorkoutDayComposer";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import { toast } from "@/store/toastStore";
import type { Exercise, WorkoutPlan } from "@/types/workout";
import { buildWorkoutDayPatch } from "@/utils/workoutCustomization";
import { toUserMessage } from "@/utils/errors";
import { isOnline } from "@/utils/network";

type Props = PlannedWorkoutPlanInput & { disabled?: boolean };
function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(`${value}T12:00:00`));
}

export function PlannedWorkoutEditor(props: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [structuralEdit, setStructuralEdit] = useState(false);
  const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const openedContext = useRef<PlannedWorkoutPlanInput>(props);
  const close = useCallback(() => {
    generation.current += 1;
    setOpen(false); setLoading(false); setSaving(false); setAdding(false); setEditingId(null); setDetailExercise(null);
  }, []);
  useEffect(close, [close, props.programId, props.dayIndex, props.scheduledDate, props.weekPhase]);
  const dialogRef = useModalAccessibility(open, close);
  const byId = useMemo(() => new Map(catalog.map(row => [row.id, row])), [catalog]);
  const editingItem = plan?.exercises.find(row => row.exercise_id === editingId);
  const source = editingItem ? byId.get(editingItem.exercise_id) ?? null : null;
  const occupiedIds = useMemo(() => new Set((plan?.exercises || []).map(row => row.exercise_id)), [plan]);

  async function showEditor() {
    if (loading || props.disabled) return;
    const current = ++generation.current;
    openedContext.current = { ...props };
    setOpen(true); setLoading(true); setError(null); setPlan(null); setStructuralEdit(false);
    try {
      const cached = await readCachedExercises();
      if (current !== generation.current) return;
      if (cached.length) setCatalog(cached);
      const [prepared, fresh] = await Promise.all([
        fetchPlannedWorkoutPlan(openedContext.current),
        isOnline() && getStoredToken() ? fetchExerciseCatalog().catch(() => null) : Promise.resolve(null),
      ]);
      if (current !== generation.current) return;
      setPlan(prepared);
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
        target_sets: 3, target_reps: null, rest_sec: null,
      }] });
      setStructuralEdit(true);
    } else if (editingId) {
      setPlan({ ...plan, exercises: plan.exercises.map(row => row.exercise_id === editingId ? {
        ...row, exercise_id: exercise.id, name_ru: exercise.name_ru,
        original_exercise_id: row.original_exercise_id || row.exercise_id, suggested_weight: null,
      } : row) });
    }
    setAdding(false); setEditingId(null);
  }

  function restoreDefaults() {
    if (!plan) return;
    setPlan({ ...plan, exercises: plan.exercises.map(row => row.original_exercise_id ? {
      ...row, exercise_id: row.original_exercise_id, name_ru: byId.get(row.original_exercise_id)?.name_ru || row.name_ru,
      original_exercise_id: null, suggested_weight: null,
    } : row) });
  }

  async function save() {
    if (!plan || saving) return;
    const current = generation.current;
    const context = openedContext.current;
    setSaving(true); setError(null);
    try {
      if (structuralEdit || Object.keys(plan.customization_revisions ?? {}).length > 0) {
        const input = { program_id: context.programId, day_index: context.dayIndex, scope: "occurrence" as const, scheduled_date: context.scheduledDate };
        const [base, stored] = await Promise.all([
          fetchPlannedWorkoutPlan({ ...context, includeSavedOverride: false }), fetchWorkoutCustomization(input),
        ]);
        if (stored.revision !== (plan.customization_revisions?.occurrence ?? 0)) throw new Error("План уже изменён. Закройте подготовку и откройте её снова");
        await saveWorkoutCustomization({ ...input, base_revision: stored.revision, operation_id: crypto.randomUUID(), patch: buildWorkoutDayPatch(base, plan) });
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

  const picking = adding || editingId !== null;
  return <>
    <button type="button" disabled={props.disabled} onClick={() => void showEditor()} className="app-button app-secondary-action mt-2 w-full">
      Подготовить упражнения · {formatDate(props.scheduledDate)}
    </button>
    {open ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 sm:items-center">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="planned-workout-editor-title" tabIndex={-1} className="app-card flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-black/5 px-4 py-3">
          <div><h3 id="planned-workout-editor-title" className="font-semibold">Подготовка тренировки</h3><p className="mt-1 text-xs text-tg-hint">Изменения применятся {formatDate(props.scheduledDate)} при старте.</p></div>
          <button type="button" aria-label="Закрыть" onClick={close} className="min-h-[44px] min-w-[44px] text-tg-hint">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? <p className="text-sm text-tg-hint">Загрузка плана…</p> : null}
          {error ? <p role="alert" className="app-status app-status-danger text-sm">{error}</p> : null}
          {picking ? <PlannedExercisePicker key={adding ? "add" : editingId} source={adding ? null : source} catalog={catalog} occupiedIds={occupiedIds}
            onBack={() => { setAdding(false); setEditingId(null); }} onChoose={choose} onOpenDetail={setDetailExercise} />
            : plan ? <WorkoutDayComposer plan={plan} catalog={catalog} disabled={saving}
              onChange={next => { setPlan(next); setStructuralEdit(true); }} onAdd={() => setAdding(true)} onReplace={row => setEditingId(row.exercise_id)} onOpenDetail={setDetailExercise} /> : null}
        </div>
        {plan && !picking ? <div className="space-y-2 border-t border-black/5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button type="button" disabled={saving} onClick={() => void save()} className="app-button app-gradient-action min-h-[48px] w-full">{saving ? "Сохраняем…" : "Сохранить подготовку"}</button>
          {plan.exercises.some(row => row.original_exercise_id) ? <button type="button" disabled={saving} onClick={restoreDefaults} className="min-h-[44px] w-full text-xs text-tg-hint">Вернуть упражнения программы</button> : null}
        </div> : null}
      </div>
    </div> : null}
    {detailExercise ? <ExerciseDetailModal exercise={detailExercise} onClose={() => setDetailExercise(null)} /> : null}
  </>;
}
