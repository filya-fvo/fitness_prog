import { useState } from "react";
import type { Exercise, WorkoutPlanExercise, WorkoutSetMethod } from "@/types/workout";
import { inferLoadType } from "@/utils/exerciseLoadType";
import { workoutMethodLabels } from "@/utils/workoutMethods";

type Props = { row: WorkoutPlanExercise; exercise?: Exercise; disabled?: boolean; onChange: (methods: WorkoutSetMethod[]) => void };
const field = "app-field mt-1 min-h-[44px] w-full px-2 py-2 text-base";
export function WorkoutMethodEditor({ row, exercise, disabled, onChange }: Props) {
  const [selection, setSelection] = useState("last");
  const slots = selection === "all" ? Array.from({ length: row.target_sets }, (_, i) => i + 1)
    : [selection === "last" ? row.target_sets : Math.min(row.target_sets, Number(selection))];
  const methods = row.set_methods ?? [];
  const picked = slots.map(slot => methods.find(method => method.set_number === slot));
  const signature = (method: WorkoutSetMethod | undefined) => JSON.stringify({ kind: method?.kind ?? "standard", parts: method?.parts ?? [] });
  const kind = picked.every(method => signature(method) === signature(picked[0])) ? picked[0]?.kind ?? "standard" : "mixed";
  const shown = picked.find(method => method?.kind === kind);
  const allowed = Boolean(exercise && inferLoadType(exercise) === "weight_reps");
  const locked = disabled || !allowed;
  const name = row.name_ru || exercise?.name_ru || "Упражнение";
  function defaults(selectedKind: "drop" | "cluster", slot: number): WorkoutSetMethod {
    return { set_number: slot, kind: selectedKind, parts: [0, 1, 2].map(i => ({ target_reps: selectedKind === "cluster" ? 4 : 10,
      target_weight: row.suggested_weight ? Math.round(row.suggested_weight * (selectedKind === "drop" ? 1 - i * 0.2 : 1) * 100) / 100 : null,
      pause_after_sec: selectedKind === "cluster" && i < 2 ? 20 : 0 })) };
  }
  function changeKind(value: string) {
    const remaining = methods.filter(method => !slots.includes(method.set_number));
    const template = picked.find(method => method?.kind === value);
    const next = value === "standard" ? remaining : [...remaining, ...slots.map(slot => {
      const common = template ?? defaults(value as "drop" | "cluster", slot);
      return { ...common, set_number: slot, parts: common.parts.map(part => ({ ...part })) };
    })];
    onChange(next.sort((a, b) => a.set_number - b.set_number));
  }
  function edit(update: (method: WorkoutSetMethod) => WorkoutSetMethod) {
    if (kind !== "drop" && kind !== "cluster") return;
    const remaining = methods.filter(method => !slots.includes(method.set_number));
    onChange([...remaining, ...slots.map(slot => update(methods.find(method => method.set_number === slot) ?? defaults(kind, slot)))].sort((a, b) => a.set_number - b.set_number));
  }
  function editPart(index: number, values: Partial<WorkoutSetMethod["parts"][number]>) {
    edit(method => ({ ...method, parts: method.parts.map((part, i) => i === index ? { ...part, ...values } : part) }));
  }
  const summary = methods.length ? methods.map(method => `${workoutMethodLabels[method.kind]} · подход ${method.set_number}`).join("; ") : "Обычные подходы";
  return <details className="app-card-inset mt-3 px-3" aria-label={`Методы ${name}`}>
    <summary className="min-h-[44px] cursor-pointer py-3 text-xs font-medium">{summary}</summary>
    <div className="space-y-3 pb-3">
      <label className="block text-xs text-tg-hint">Для подходов<select aria-label={`Для подходов ${name}`} value={selection} disabled={disabled} onChange={event => setSelection(event.target.value)} className={field}>
        <option value="last">Последний подход</option><option value="all">Все подходы</option>
        {Array.from({ length: row.target_sets }, (_, i) => <option key={i} value={String(i + 1)}>Подход {i + 1}</option>)}
      </select></label>
      <label className="block text-xs text-tg-hint">Способ выполнения<select aria-label={`Способ выполнения ${name}`} value={kind} disabled={disabled} onChange={event => changeKind(event.target.value)} className={field}>
        {kind === "mixed" ? <option value="mixed" disabled>Разные варианты</option> : null}
        <option value="standard">Обычные подходы</option><option value="drop" disabled={!allowed}>Дроп-сет</option><option value="cluster" disabled={!allowed}>Кластеры</option>
      </select></label>
      {kind === "mixed" ? <p className="text-xs text-tg-hint">Выберите способ, чтобы сделать настройки выбранных подходов одинаковыми.</p> : null}
      {!allowed ? <p className="text-xs text-tg-hint">Дроп-сет и кластеры доступны для упражнений с весом и повторами.</p> : null}
      {shown ? <>
        <p className="text-xs text-tg-hint">{kind === "cluster" ? "Части одного подхода с одинаковым весом." : "Части одного подхода с уменьшением веса."} Вес можно заполнить при выполнении; формат веса тот же, что в обычных подходах.</p>
        {kind === "cluster" ? <label className="block text-xs text-tg-hint">Рабочий вес, кг<input aria-label={`Рабочий вес ${name}`} type="number" inputMode="decimal" min={0.01} max={10000} step="0.01" placeholder="При выполнении" value={shown.parts[0].target_weight ?? ""} disabled={locked}
          onChange={event => edit(method => ({ ...method, parts: method.parts.map(part => ({ ...part, target_weight: event.target.value === "" ? null : Number(event.target.value) })) }))} className={field} /></label> : null}
        {shown.parts.map((part, index) => <div key={index} className="border-t border-black/10 pt-2 dark:border-white/10">
          <p className="mb-2 text-xs font-medium">Часть {index + 1}</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-tg-hint">Повторы<input aria-label={`Повторы части ${index + 1} ${name}`} type="number" inputMode="numeric" min={1} max={100000} value={part.target_reps || ""} disabled={locked} onChange={event => editPart(index, { target_reps: Number(event.target.value) })} className={field} /></label>
            {kind === "drop" ? <label className="text-xs text-tg-hint">Вес, кг<input aria-label={`Вес части ${index + 1} ${name}`} type="number" inputMode="decimal" min={0.01} max={10000} step="0.01" placeholder="При выполнении" value={part.target_weight ?? ""} disabled={locked}
              onChange={event => editPart(index, { target_weight: event.target.value === "" ? null : Number(event.target.value) })} className={field} /></label> : null}
            {index < shown.parts.length - 1 ? <label className="text-xs text-tg-hint">Пауза, с<input aria-label={`Пауза после части ${index + 1} ${name}`} type="number" inputMode="numeric" min={0} max={600} value={part.pause_after_sec} disabled={locked} onChange={event => editPart(index, { pause_after_sec: Number(event.target.value) })} className={field} /></label> : null}
          </div>
          {index === shown.parts.length - 1 ? <p className="mt-2 text-xs text-tg-hint">Далее — следующий участник или отдых между подходами.</p> : null}
        </div>)}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={locked || shown.parts.length >= 8} className="min-h-[44px] rounded-lg px-2 text-xs text-tg-link" onClick={() => edit(method => {
            const last = method.parts[method.parts.length - 1];
            return { ...method, parts: [...method.parts.map((part, i) => i === method.parts.length - 1 ? { ...part, pause_after_sec: kind === "cluster" ? method.parts[0].pause_after_sec : 0 } : part),
              { ...last, target_weight: kind === "drop" && last.target_weight ? Math.round(last.target_weight * 0.8 * 100) / 100 || null : last.target_weight, pause_after_sec: 0 }] };
          })}>Добавить часть</button>
          <button type="button" disabled={locked || shown.parts.length <= 2} className="min-h-[44px] rounded-lg px-2 text-xs text-tg-hint" onClick={() => edit(method => ({ ...method, parts: method.parts.slice(0, -1).map((part, i, rows) => i === rows.length - 1 ? { ...part, pause_after_sec: 0 } : part) }))}>Убрать последнюю часть</button>
        </div>
      </> : null}
    </div>
  </details>;
}
