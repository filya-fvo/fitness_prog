import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { pluralRu, setsCount } from "@/utils/localization";
import type { WorkoutGroup, WorkoutPlan } from "@/types/workout";
import { configureWorkoutGroup, dissolveWorkoutGroup, workoutGroupLabels } from "@/utils/workoutMethods";
import { ProgramNumberField } from "./ProgramNumberField";
import { validProgramNumber } from "./programNumbers";
import type { GroupProposal, WorkoutRaw } from "./workoutEditorDraft";

type Props = { plan: WorkoutPlan; disabled?: boolean; maxRounds?: number; saveHint?: string; raw?: WorkoutRaw; proposal?: GroupProposal | null; onProposalChange?: (proposal: GroupProposal | null) => void; onChange: (plan: WorkoutPlan, appliedId?: string) => void; onEditingChange: (editing: boolean) => void };
const field = "app-field mt-1 min-h-[44px] w-full px-2 py-2 text-base";
export type WorkoutGroupEditorHandle = { startWith: (exerciseId: string) => void };
export const WorkoutGroupEditor = forwardRef<WorkoutGroupEditorHandle, Props>(function WorkoutGroupEditor({ plan, disabled, maxRounds = 20, saveHint = "После создания связки сохраните подготовку тренировки.", raw, proposal, onProposalChange, onChange, onEditingChange }, ref) {
  const editor = useRef<HTMLElement>(null);
  const [localDraft, setLocalDraft] = useState<GroupProposal | null>(null);
  const draft = proposal === undefined ? localDraft : proposal;
  function setDraft(value: GroupProposal | null) { if (onProposalChange) onProposalChange(value); else setLocalDraft(value); }
  const [error, setError] = useState<string | null>(null);
  const names = new Map(plan.exercises.map(row => [row.exercise_id, row.name_ru || "Упражнение"]));
  const draftId = draft?.id;
  useEffect(() => {
    if (!draftId) return;
    editor.current?.scrollIntoView({ block: "start" });
    editor.current?.querySelector<HTMLSelectElement>("select")?.focus({ preventScroll: true });
  }, [draftId]);
  function begin(group?: WorkoutGroup, kind: WorkoutGroup["kind"] = "superset", exerciseId?: string) {
    if (disabled || draft) return;
    const next = group ?? { id: crypto.randomUUID(), kind, exercise_ids: exerciseId ? [exerciseId] : [],
      rounds: plan.exercises.find(row => row.exercise_id === exerciseId)?.target_sets ?? 3, transition_sec: 0, round_rest_sec: 90 };
    setDraft({ ...next, exercise_ids: [...next.exercise_ids], rounds: raw?.[`${next.id}/rounds`] ?? String(next.rounds),
      transition_sec: raw?.[`${next.id}/transition_sec`] ?? String(next.transition_sec), round_rest_sec: raw?.[`${next.id}/round_rest_sec`] ?? String(next.round_rest_sec), isNew: !group });
    setError(null); onEditingChange(true);
  }
  useImperativeHandle(ref, () => ({ startWith: exerciseId => begin(undefined, "superset", exerciseId) }));
  function cancel() { setDraft(null); setError(null); onEditingChange(false); }
  function apply() {
    if (!draft || !validNumbers) return;
    const group: WorkoutGroup = { id: draft.id, kind: draft.kind, exercise_ids: draft.exercise_ids,
      rounds: Number(draft.rounds), transition_sec: Number(draft.transition_sec), round_rest_sec: Number(draft.round_rest_sec) };
    try { onChange(configureWorkoutGroup(plan, group), group.id); cancel(); }
    catch (err) { setError(err instanceof Error ? err.message : "Проверьте участников и раунды связки"); }
  }
  const required = draft?.kind === "superset" ? 2 : draft?.kind === "triset" ? 3 : null;
  const validCount = draft && (required ? draft.exercise_ids.length === required : draft.exercise_ids.length >= 2);
  const validNumbers = draft && validProgramNumber(draft.rounds, 1, maxRounds) && validProgramNumber(draft.transition_sec, 0, 600) && validProgramNumber(draft.round_rest_sec, 0, 600);
  const available = plan.exercises.filter(row => !(plan.groups ?? []).some(group => group.exercise_ids.includes(row.exercise_id))).length;
  return <div className="space-y-2">
    <h4 className="text-sm font-semibold">Суперсеты, трисеты и круги</h4>
    <p className="text-xs text-tg-hint">Суперсет — 2 упражнения подряд, трисет — 3. Выберите участников и задайте отдых после всего круга.</p>
    {(plan.groups ?? []).map(group => <section key={group.id} aria-label={`Связка ${workoutGroupLabels[group.kind]}`} className="app-card app-card-plum p-3">
      <p className="text-sm font-semibold">{workoutGroupLabels[group.kind]} · {pluralRu(group.rounds, ["раунд", "раунда", "раундов"])}</p>
      <p className="mt-1 break-words text-xs">{group.exercise_ids.map(id => names.get(id)).join(" → ")}</p>
      <p className="mt-1 text-xs text-tg-hint">Переход {group.transition_sec} с · отдых после раунда {group.round_rest_sec} с</p>
      <div className="mt-1 flex flex-wrap gap-2">
        <button type="button" disabled={disabled || Boolean(draft)} className="min-h-[44px] px-2 text-xs text-tg-link" onClick={() => begin(group)}>Изменить связку</button>
        <button type="button" disabled={disabled || Boolean(draft)} className="min-h-[44px] px-2 text-xs text-tg-hint" onClick={() => onChange(dissolveWorkoutGroup(plan, group.id))}>Распустить связку</button>
      </div>
    </section>)}
    {draft ? <section ref={editor} aria-label="Настройка связки" className="app-card-inset scroll-mt-3 space-y-3 p-3">
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ProgramNumberField label="Раунды" min={1} max={maxRounds} disabled={disabled} value={draft.rounds} onChange={rounds => setDraft({ ...draft, rounds })} />
        <ProgramNumberField label="Переход, с" ariaLabel="Переход между упражнениями, с" min={0} max={600} disabled={disabled} value={draft.transition_sec} onChange={transition_sec => setDraft({ ...draft, transition_sec })} presets={[0, 15, 30]} />
      </div>
      <ProgramNumberField label="Отдых после раунда, с" min={0} max={600} disabled={disabled} value={draft.round_rest_sec} onChange={round_rest_sec => setDraft({ ...draft, round_rest_sec })} presets={[0, 60, 90, 120]} />
      <p className="text-xs text-tg-hint">У каждого участника будет {validProgramNumber(draft.rounds, 1, maxRounds) ? setsCount(Number(draft.rounds)) : "…"}. Выбранные упражнения соберутся в один блок; настройки лишних подходов будут убраны.</p>
      <p className="text-xs text-tg-hint">{saveHint}</p>
      {error ? <p role="alert" className="app-status app-status-danger text-xs">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={disabled || !validCount || !validNumbers} onClick={apply} className="app-button app-secondary-action px-3 text-sm">{draft.isNew ? "Создать связку" : "Сохранить связку"}</button>
        <button type="button" disabled={disabled} onClick={cancel} className="min-h-[44px] px-3 text-sm text-tg-hint">Отменить настройку связки</button>
      </div>
    </section> : <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={disabled || available < 2} onClick={() => begin(undefined, "superset")} className="app-button app-secondary-action px-3 text-sm">Создать суперсет</button>
        <button type="button" disabled={disabled || available < 3} onClick={() => begin(undefined, "triset")} className="app-button app-secondary-action px-3 text-sm">Создать трисет</button>
        <button type="button" disabled={disabled || available < 2} onClick={() => begin(undefined, "circuit")} className="app-button app-secondary-action px-3 text-sm">Создать круг</button>
      </div>
      {available < 3 ? <p className="text-xs text-tg-hint">Для новой связки нужны свободные упражнения: для суперсета — 2, для трисета — 3. При необходимости добавьте упражнение из каталога.</p> : null}
    </div>}
  </div>;
});
