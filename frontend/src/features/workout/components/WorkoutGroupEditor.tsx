import { useState } from "react";
import { pluralRu, setsCount } from "@/utils/localization";
import type { WorkoutGroup, WorkoutPlan } from "@/types/workout";
import { configureWorkoutGroup, dissolveWorkoutGroup, workoutGroupLabels } from "@/utils/workoutMethods";

type Props = { plan: WorkoutPlan; disabled?: boolean; onChange: (plan: WorkoutPlan) => void; onEditingChange: (editing: boolean) => void };
const field = "app-field mt-1 min-h-[44px] w-full px-2 py-2 text-base";
export function WorkoutGroupEditor({ plan, disabled, onChange, onEditingChange }: Props) {
  const [draft, setDraft] = useState<WorkoutGroup | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const names = new Map(plan.exercises.map(row => [row.exercise_id, row.name_ru || "Упражнение"]));
  function begin(group?: WorkoutGroup) {
    setDraft(group ? { ...group, exercise_ids: [...group.exercise_ids] } : { id: crypto.randomUUID(), kind: "superset", exercise_ids: [], rounds: 3, transition_sec: 0, round_rest_sec: 90 });
    setIsNew(!group); setError(null); onEditingChange(true);
  }
  function cancel() { setDraft(null); setError(null); onEditingChange(false); }
  function apply() {
    if (!draft) return;
    try { onChange(configureWorkoutGroup(plan, draft)); cancel(); }
    catch (err) { setError(err instanceof Error ? err.message : "Проверьте участников и раунды связки"); }
  }
  const required = draft?.kind === "superset" ? 2 : draft?.kind === "triset" ? 3 : null;
  const validCount = draft && (required ? draft.exercise_ids.length === required : draft.exercise_ids.length >= 2);
  return <div className="space-y-2">
    {(plan.groups ?? []).map(group => <section key={group.id} aria-label={`Связка ${workoutGroupLabels[group.kind]}`} className="app-card app-card-plum p-3">
      <p className="text-sm font-semibold">{workoutGroupLabels[group.kind]} · {pluralRu(group.rounds, ["раунд", "раунда", "раундов"])}</p>
      <p className="mt-1 break-words text-xs">{group.exercise_ids.map(id => names.get(id)).join(" → ")}</p>
      <p className="mt-1 text-xs text-tg-hint">Переход {group.transition_sec} с · отдых после раунда {group.round_rest_sec} с</p>
      <div className="mt-1 flex flex-wrap gap-2">
        <button type="button" disabled={disabled || Boolean(draft)} className="min-h-[44px] px-2 text-xs text-tg-link" onClick={() => begin(group)}>Изменить связку</button>
        <button type="button" disabled={disabled || Boolean(draft)} className="min-h-[44px] px-2 text-xs text-tg-hint" onClick={() => onChange(dissolveWorkoutGroup(plan, group.id))}>Распустить связку</button>
      </div>
    </section>)}
    {draft ? <section aria-label="Настройка связки" className="app-card-inset space-y-3 p-3">
      <label className="block text-xs text-tg-hint">Вид связки<select aria-label="Вид связки" value={draft.kind} disabled={disabled} onChange={event => setDraft({ ...draft, kind: event.target.value as WorkoutGroup["kind"] })} className={field}>
        <option value="superset">Суперсет</option><option value="triset">Трисет</option><option value="circuit">Круговая тренировка</option>
      </select></label>
      <fieldset><legend className="text-xs font-medium">Участники {required ? `(нужно ${required})` : "(от двух)"}</legend>
        {plan.exercises.map(row => {
          const occupied = plan.groups?.some(group => group.id !== draft.id && group.exercise_ids.includes(row.exercise_id));
          return <label key={row.exercise_id} className={`flex min-h-[44px] items-center gap-2 py-2 text-sm ${occupied ? "text-tg-hint" : ""}`}>
            <input type="checkbox" checked={draft.exercise_ids.includes(row.exercise_id)} disabled={disabled || occupied} onChange={event => setDraft({ ...draft,
              exercise_ids: event.target.checked ? [...draft.exercise_ids, row.exercise_id] : draft.exercise_ids.filter(id => id !== row.exercise_id) })} className="h-5 w-5 shrink-0" />
            <span className="break-words">{row.name_ru || "Упражнение"}{occupied ? " · в другой связке" : ""}</span>
          </label>;
        })}
      </fieldset>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-tg-hint">Раунды<input aria-label="Раунды" type="number" inputMode="numeric" min={1} max={20} disabled={disabled} value={draft.rounds || ""} onChange={event => setDraft({ ...draft, rounds: Number(event.target.value) })} className={field} /></label>
        <label className="text-xs text-tg-hint">Переход, с<input aria-label="Переход между упражнениями, с" type="number" inputMode="numeric" min={0} max={600} disabled={disabled} value={draft.transition_sec} onChange={event => setDraft({ ...draft, transition_sec: Number(event.target.value) })} className={field} /></label>
      </div>
      <label className="block text-xs text-tg-hint">Отдых после раунда, с<input aria-label="Отдых после раунда, с" type="number" inputMode="numeric" min={0} max={600} disabled={disabled} value={draft.round_rest_sec} onChange={event => setDraft({ ...draft, round_rest_sec: Number(event.target.value) })} className={field} /></label>
      <p className="text-xs text-tg-hint">У каждого участника будет {draft.rounds ? setsCount(draft.rounds) : "…"}. Выбранные упражнения соберутся в один блок; настройки лишних подходов будут убраны.</p>
      <p className="text-xs text-tg-hint">После создания связки сохраните подготовку тренировки.</p>
      {error ? <p role="alert" className="app-status app-status-danger text-xs">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={disabled || !validCount} onClick={apply} className="app-button app-secondary-action px-3 text-sm">{isNew ? "Создать связку" : "Сохранить связку"}</button>
        <button type="button" disabled={disabled} onClick={cancel} className="min-h-[44px] px-3 text-sm text-tg-hint">Отменить настройку связки</button>
      </div>
    </section> : <button type="button" disabled={disabled || plan.exercises.length < 2} onClick={() => begin()} className="app-button app-secondary-action w-full">Объединить упражнения</button>}
  </div>;
}
