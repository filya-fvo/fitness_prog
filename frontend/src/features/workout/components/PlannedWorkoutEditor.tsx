import { useMemo, useState } from "react";

import { getStoredToken } from "@/api/client";
import { fetchExercises } from "@/api/exercises";
import {
  fetchPlannedWorkoutPlan,
  savePlannedWorkoutPlan,
  type PlannedWorkoutPlanInput,
} from "@/api/workouts";
import { cacheExercises, readCachedExercises } from "@/db/syncQueue";
import { ExerciseDetailModal } from "@/features/workout/components/ExerciseDetailModal";
import { ExerciseThumbnail } from "@/features/workout/components/ExerciseThumbnail";
import { PlannedExercisePicker } from "@/features/workout/components/PlannedExercisePicker";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import { toast } from "@/store/toastStore";
import type { Exercise, WorkoutPlan } from "@/types/workout";
import { toUserMessage } from "@/utils/errors";
import { isOnline } from "@/utils/network";

type Props = PlannedWorkoutPlanInput & { disabled?: boolean };

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(
    new Date(`${value}T12:00:00`),
  );
}

export function PlannedWorkoutEditor(props: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalAccessibility(open, () => setOpen(false));

  const byId = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);
  const editingItem = plan?.exercises.find(
    (item) => (item.original_exercise_id || item.exercise_id) === editingSourceId,
  );
  const sourceExercise = editingItem
    ? byId.get(editingItem.original_exercise_id || editingItem.exercise_id) ?? null
    : null;
  const occupiedIds = useMemo(
    () => new Set((plan?.exercises || []).map((item) => item.exercise_id)),
    [plan],
  );

  async function showEditor() {
    if (loading || props.disabled) return;
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const cached = await readCachedExercises();
      if (cached.length) setCatalog(cached);
      const [preparedPlan, freshCatalog] = await Promise.all([
        fetchPlannedWorkoutPlan(props),
        isOnline() && getStoredToken()
          ? fetchExercises({ pageSize: 200 }).catch(() => null)
          : Promise.resolve(null),
      ]);
      setPlan(preparedPlan);
      if (freshCatalog?.items.length) {
        setCatalog(freshCatalog.items);
        await cacheExercises(freshCatalog.items);
      }
    } catch (err) {
      setError(toUserMessage(err, "Не удалось загрузить план тренировки"));
    } finally {
      setLoading(false);
    }
  }

  function chooseReplacement(exercise: Exercise) {
    if (!editingSourceId || !plan) return;
    setPlan({
      ...plan,
      exercises: plan.exercises.map((item) => {
        const originalId = item.original_exercise_id || item.exercise_id;
        if (originalId !== editingSourceId) return item;
        return {
          ...item,
          exercise_id: exercise.id,
          name_ru: exercise.name_ru,
          original_exercise_id: editingSourceId,
          suggested_weight: null,
        };
      }),
    });
    setEditingSourceId(null);
  }

  function restoreDefaults() {
    if (!plan) return;
    setPlan({
      ...plan,
      exercises: plan.exercises.map((item) => {
        const originalId = item.original_exercise_id;
        if (!originalId) return item;
        const original = byId.get(originalId);
        return {
          ...item,
          exercise_id: originalId,
          name_ru: original?.name_ru || item.name_ru,
          original_exercise_id: null,
          suggested_weight: null,
        };
      }),
    });
    setEditingSourceId(null);
  }

  async function save() {
    if (!plan || saving) return;
    setSaving(true);
    setError(null);
    try {
      const replacements = plan.exercises.flatMap((item) =>
        item.original_exercise_id && item.original_exercise_id !== item.exercise_id
          ? [{ fromExerciseId: item.original_exercise_id, toExerciseId: item.exercise_id }]
          : [],
      );
      const stored = await savePlannedWorkoutPlan({ ...props, replacements });
      setPlan(stored);
      setEditingSourceId(null);
      setOpen(false);
      toast("Подготовка сохранена");
    } catch (err) {
      setError(toUserMessage(err, "Не удалось сохранить подготовку"));
    } finally {
      setSaving(false);
    }
  }

  const replacementCount = plan?.exercises.filter((item) => item.original_exercise_id).length ?? 0;

  return (
    <>
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => void showEditor()}
        className="mt-2 min-h-[44px] w-full rounded-xl bg-tg-bg px-4 py-2.5 text-sm font-medium text-tg-link disabled:opacity-50"
      >
        Подготовить упражнения · {formatDate(props.scheduledDate)}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 sm:items-center">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="planned-workout-editor-title"
            tabIndex={-1}
            className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-tg-bg shadow-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-black/5 px-4 py-3">
              <div>
                <h3 id="planned-workout-editor-title" className="font-semibold">Подготовка тренировки</h3>
                <p className="mt-0.5 text-xs text-tg-hint">
                  Замены применятся {formatDate(props.scheduledDate)} при старте.
                </p>
              </div>
              <button type="button" aria-label="Закрыть" onClick={() => setOpen(false)} className="min-h-[44px] min-w-[44px] text-tg-hint">✕</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {loading ? <p className="text-sm text-tg-hint">Загрузка плана…</p> : null}
              {error ? <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-600">{error}</p> : null}
              {editingSourceId ? (
                sourceExercise ? (
                  <PlannedExercisePicker
                    key={editingSourceId}
                    source={sourceExercise}
                    catalog={catalog}
                    occupiedIds={occupiedIds}
                    onBack={() => setEditingSourceId(null)}
                    onChoose={chooseReplacement}
                    onOpenDetail={setDetailExercise}
                  />
                ) : (
                  <div className="rounded-xl bg-tg-secondary p-3 text-xs text-tg-hint">
                    <p>Исходное упражнение не найдено в каталоге.</p>
                    <button type="button" onClick={() => setEditingSourceId(null)} className="mt-2 min-h-[44px] text-tg-link">← К плану</button>
                  </div>
                )
              ) : plan ? (
                <div className="space-y-2">
                  {plan.exercises.map((item) => {
                    const exercise = byId.get(item.exercise_id) ?? null;
                    return (
                      <div key={item.order} className="rounded-xl bg-tg-secondary p-3">
                        <div className="flex items-center gap-3">
                          {exercise ? <ExerciseThumbnail exercise={exercise} /> : null}
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-medium">{item.name_ru || exercise?.name_ru || "Упражнение"}</p>
                            <p className="mt-0.5 text-xs text-tg-hint">{item.target_sets} × {item.target_reps || "по плану"}</p>
                            {item.original_exercise_id ? <p className="mt-1 text-[11px] text-tg-link">Подготовлена замена</p> : null}
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button type="button" onClick={() => setEditingSourceId(item.original_exercise_id || item.exercise_id)} className="min-h-[44px] rounded-lg px-2 text-xs font-medium text-tg-link">Заменить</button>
                          {exercise ? (
                            <button type="button" onClick={() => setDetailExercise(exercise)} className="min-h-[44px] rounded-lg px-2 text-xs text-tg-link">Техника и описание</button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
            {plan && !editingSourceId ? (
              <div className="space-y-2 border-t border-black/5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <button type="button" disabled={saving} onClick={() => void save()} className="min-h-[48px] w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-60">{saving ? "Сохраняем…" : "Сохранить подготовку"}</button>
                {replacementCount ? <button type="button" disabled={saving} onClick={restoreDefaults} className="min-h-[44px] w-full text-xs text-tg-hint">Вернуть упражнения программы</button> : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {detailExercise ? (
        <ExerciseDetailModal
          exercise={detailExercise}
          onClose={() => setDetailExercise(null)}
        />
      ) : null}
    </>
  );
}
