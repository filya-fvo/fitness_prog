import type { AdminExercise } from "@/api/adminExercises";

import { moveItem, type ProgramDayDraft, type ProgramExerciseDraft } from "../programDraft";
import { ProgramExercisePicker } from "./ProgramExercisePicker";

type Props = {
  day: ProgramDayDraft;
  index: number;
  count: number;
  onChange: (day: ProgramDayDraft) => void;
  onMove: (direction: -1 | 1) => void;
  onCopy: () => void;
  onRemove: () => void;
};

const inputClass = "min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 py-2 text-base";

function key(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function ProgramDayEditor({ day, index, count, onChange, onMove, onCopy, onRemove }: Props) {
  function updateExercise(position: number, patch: Partial<ProgramExerciseDraft>) {
    onChange({
      ...day,
      exercises: day.exercises.map((item, itemIndex) => (
        itemIndex === position ? { ...item, ...patch } : item
      )),
    });
  }

  function removeExercise(position: number) {
    onChange({ ...day, exercises: day.exercises.filter((_, itemIndex) => itemIndex !== position) });
  }

  function pickExercise(exercise: AdminExercise) {
    onChange({
      ...day,
      exercises: [...day.exercises, {
        key: key(),
        exerciseId: exercise.id,
        exerciseName: exercise.name_ru,
        sets: 3,
        reps: "8-12",
        restSec: 60,
        weightMode: exercise.weight_rule === "per_hand" ? "per_hand" : null,
        note: "",
        source: {},
      }],
    });
  }

  const selectedIds = new Set(day.exercises.flatMap((item) => item.exerciseId ? [item.exerciseId] : []));

  return (
    <article className="space-y-3 rounded-2xl border border-black/10 bg-tg-secondary p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">День {index + 1}</h3>
        <div className="flex flex-wrap gap-1 text-xs">
          <button type="button" disabled={index === 0} onClick={() => onMove(-1)} className="min-h-11 min-w-11 rounded-lg bg-tg-bg disabled:opacity-30" aria-label="Поднять день">↑</button>
          <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} className="min-h-11 min-w-11 rounded-lg bg-tg-bg disabled:opacity-30" aria-label="Опустить день">↓</button>
          <button type="button" onClick={onCopy} className="min-h-11 rounded-lg bg-tg-bg px-3 text-tg-link">Копировать</button>
          <button type="button" onClick={onRemove} className="min-h-11 rounded-lg bg-tg-bg px-3 text-red-500">Удалить</button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-tg-hint">Название дня
          <input value={day.name} onChange={(event) => onChange({ ...day, name: event.target.value })} className={inputClass} maxLength={120} />
        </label>
        <label className="grid gap-1 text-xs text-tg-hint">Фокус
          <input value={day.focus} onChange={(event) => onChange({ ...day, focus: event.target.value })} className={inputClass} maxLength={80} placeholder="Ноги, верх, всё тело" />
        </label>
      </div>

      {day.exercises.length ? (
        <ol className="space-y-3">
          {day.exercises.map((exercise, exerciseIndex) => (
            <li key={exercise.key} className="rounded-xl bg-tg-bg p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{exerciseIndex + 1}. {exercise.exerciseName || "Упражнение"}</p>
                  <p className="text-[11px] text-tg-hint">{exercise.exerciseId ? "Из каталога" : "Ссылка по названию"}</p>
                </div>
                <div className="flex gap-1">
                  <button type="button" disabled={exerciseIndex === 0} onClick={() => onChange({ ...day, exercises: moveItem(day.exercises, exerciseIndex, exerciseIndex - 1) })} className="min-h-11 min-w-11 rounded-lg bg-tg-secondary disabled:opacity-30" aria-label={`Поднять ${exercise.exerciseName}`}>↑</button>
                  <button type="button" disabled={exerciseIndex === day.exercises.length - 1} onClick={() => onChange({ ...day, exercises: moveItem(day.exercises, exerciseIndex, exerciseIndex + 1) })} className="min-h-11 min-w-11 rounded-lg bg-tg-secondary disabled:opacity-30" aria-label={`Опустить ${exercise.exerciseName}`}>↓</button>
                  <button type="button" onClick={() => removeExercise(exerciseIndex)} className="min-h-11 rounded-lg px-2 text-red-500" aria-label={`Удалить ${exercise.exerciseName}`}>×</button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="grid gap-1 text-xs text-tg-hint">Подходы
                  <input type="number" min={1} max={20} value={exercise.sets} onChange={(event) => updateExercise(exerciseIndex, { sets: Number(event.target.value) })} className={inputClass} />
                </label>
                <label className="grid gap-1 text-xs text-tg-hint">Повторы / время
                  <input value={exercise.reps} onChange={(event) => updateExercise(exerciseIndex, { reps: event.target.value })} className={inputClass} maxLength={40} />
                </label>
                <label className="grid gap-1 text-xs text-tg-hint">Отдых, сек.
                  <input type="number" min={0} max={600} value={exercise.restSec} onChange={(event) => updateExercise(exerciseIndex, { restSec: Number(event.target.value) })} className={inputClass} />
                </label>
                <label className="grid gap-1 text-xs text-tg-hint">Режим веса
                  <select value={exercise.weightMode || ""} onChange={(event) => updateExercise(exerciseIndex, { weightMode: event.target.value ? event.target.value as Exclude<ProgramExerciseDraft["weightMode"], null> : null })} className={inputClass}>
                    <option value="">По карточке упражнения</option><option value="total">Общий вес</option><option value="per_hand">Вес одной гантели</option>
                  </select>
                </label>
              </div>
              <label className="mt-2 grid gap-1 text-xs text-tg-hint">Комментарий
                <input value={exercise.note} onChange={(event) => updateExercise(exerciseIndex, { note: event.target.value })} className={inputClass} maxLength={500} />
              </label>
            </li>
          ))}
        </ol>
      ) : <p className="rounded-xl bg-tg-bg p-3 text-sm text-tg-hint">Добавьте хотя бы одно упражнение.</p>}
      <ProgramExercisePicker selectedIds={selectedIds} onPick={pickExercise} />
    </article>
  );
}
