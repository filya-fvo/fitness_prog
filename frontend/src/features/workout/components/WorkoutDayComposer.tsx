import type { Exercise, WorkoutPlan, WorkoutPlanExercise } from "@/types/workout";
import { ExerciseThumbnail } from "./ExerciseThumbnail";
import { reorderWorkoutExercise, updateWorkoutExercise } from "@/utils/workoutCustomization";

type Props = {
  plan: WorkoutPlan; catalog: Exercise[]; disabled?: boolean;
  onChange: (plan: WorkoutPlan) => void; onAdd: () => void;
  onReplace: (row: WorkoutPlanExercise) => void; onOpenDetail: (exercise: Exercise) => void;
};
export function WorkoutDayComposer({ plan, catalog, disabled, onChange, onAdd, onReplace, onOpenDetail }: Props) {
  const byId = new Map(catalog.map(row => [row.id, row]));
  function change(id: string, values: Partial<WorkoutPlanExercise>) {
    onChange(updateWorkoutExercise(plan, id, values));
  }
  return <div className="space-y-3">
    {plan.exercises.map((row, index) => {
      const exercise = byId.get(row.exercise_id);
      const name = row.name_ru || exercise?.name_ru || "Упражнение";
      return <section key={row.exercise_id} className="app-card app-card-ocean p-3" aria-label={name}>
        <div className="flex items-center gap-3">
          {exercise ? <ExerciseThumbnail exercise={exercise} /> : null}
          <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{name}</p>
            <p className="mt-1 text-xs text-tg-hint">{row.target_sets} × {row.target_reps || "по фазе программы"}</p>
            {row.original_exercise_id ? <p className="mt-1 text-xs text-tg-link">Подготовлена замена</p> : null}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <label className="text-xs text-tg-hint">Подходы<input type="number" inputMode="numeric" min={1} max={20} value={row.target_sets} disabled={disabled} onChange={event => {
            const value = Number(event.target.value); if (value >= 1 && value <= 20) change(row.exercise_id, { target_sets: value });
          }} className="app-field mt-1 w-full px-2 py-2 text-base" /></label>
          <label className="text-xs text-tg-hint">Повторы<input value={row.target_reps ?? ""} placeholder="По фазе" maxLength={30} disabled={disabled} onChange={event => change(row.exercise_id, { target_reps: event.target.value || null })} className="app-field mt-1 w-full px-2 py-2 text-base" /></label>
          <label className="text-xs text-tg-hint">Отдых, с<input type="number" inputMode="numeric" min={0} max={600} value={row.rest_sec ?? ""} placeholder="По фазе" disabled={disabled} onChange={event => {
            const value = event.target.value === "" ? null : Number(event.target.value);
            if (value === null || (value >= 0 && value <= 600)) change(row.exercise_id, { rest_sec: value });
          }} className="app-field mt-1 w-full px-2 py-2 text-base" /></label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <button type="button" disabled={disabled} onClick={() => onReplace(row)} className="min-h-[44px] rounded-lg px-2 text-xs font-medium text-tg-link">Заменить</button>
          {exercise ? <button type="button" disabled={disabled} onClick={() => onOpenDetail(exercise)} className="min-h-[44px] rounded-lg px-2 text-xs text-tg-link">Техника и описание</button> : null}
          <button type="button" aria-label={`Поднять ${name}`} disabled={disabled || index === 0} onClick={() => onChange(reorderWorkoutExercise(plan, row.exercise_id, -1))} className="min-h-[44px] min-w-[44px] rounded-lg text-tg-link disabled:opacity-30">↑</button>
          <button type="button" aria-label={`Опустить ${name}`} disabled={disabled || index === plan.exercises.length - 1} onClick={() => onChange(reorderWorkoutExercise(plan, row.exercise_id, 1))} className="min-h-[44px] min-w-[44px] rounded-lg text-tg-link disabled:opacity-30">↓</button>
          <button type="button" aria-label={`Убрать ${name}`} disabled={disabled || plan.exercises.length <= 1} onClick={() => onChange({ ...plan, exercises: plan.exercises.filter(item => item.exercise_id !== row.exercise_id).map((item, order) => ({ ...item, order: order + 1 })) })} className="min-h-[44px] rounded-lg px-2 text-xs text-tg-hint disabled:opacity-30">Убрать</button>
        </div>
      </section>;
    })}
    <button type="button" disabled={disabled || plan.exercises.length >= 20 || catalog.length === 0} onClick={onAdd} className="app-button app-secondary-action w-full">Добавить упражнение</button>
    <p className="text-xs text-tg-hint">Изменения сохранятся только для вас.</p>
  </div>;
}
