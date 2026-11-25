import type { Exercise, LocalSetDraft, WorkoutPlanExercise } from "@/types/workout";
import { executionInputError, executionSetInput, executionSetLabel, type ExecutionLoadSuggestion } from "@/utils/executionSetInput";
import type { ExecutionFacts, ExecutionStep } from "@/utils/workoutExecution";

type Props = {
  exercise: Exercise;
  row: WorkoutPlanExercise;
  drafts: LocalSetDraft[];
  steps: ExecutionStep[];
  facts: ExecutionFacts;
  viewedId: string;
  busy: boolean;
  resting: boolean;
  suggestion?: ExecutionLoadSuggestion;
  invalidRestIds: string[];
  onEdit: (step: ExecutionStep, opener: HTMLButtonElement) => void;
  onComplete: (step: ExecutionStep, draft: LocalSetDraft, values: LocalSetDraft) => void;
};

export function ExecutionSetList({ exercise, row, drafts, steps, facts, viewedId, busy, resting, suggestion, invalidRestIds, onEdit, onComplete }: Props) {
  return <ol aria-label="Подходы упражнения" className="app-card-inset space-y-2 rounded-xl p-2">
    {drafts.map(draft => {
      const entries = steps.filter(step => step.setNumber === draft.setNumber);
      const method = entries[0]?.kind;
      if (!entries.length) return null;
      return <li key={draft.setNumber} className="space-y-1 rounded-xl p-2 text-sm">
        {method !== "standard" ? <p className="px-1 text-xs font-medium text-tg-hint">
          Подход {draft.setNumber} · {method === "cluster" ? "Кластер" : "Дроп-сет"}
        </p> : null}
        {entries.map(entry => {
          const status = facts[entry.id];
          const viewed = entry.id === viewedId;
          const blockedPart = status === "pending" && entries.some(item =>
            item.partOrdinal !== null && item.partOrdinal < (entry.partOrdinal ?? 0) && facts[item.id] === "pending");
          const input = executionSetInput(entry, draft, row, exercise, suggestion);
          const label = entry.partOrdinal === null ? `Подход ${entry.setNumber}` : `Часть ${entry.partOrdinal}`;
          const editLabel = entry.partOrdinal === null ? `Править подход ${entry.setNumber}` : `Править часть ${entry.partOrdinal}`;
          return <div key={entry.id} aria-current={viewed ? "step" : undefined} className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg px-2 py-1.5 ${viewed ? "ring-2 ring-tg-button/40" : ""}`}>
            <div className="min-w-0 flex-1 basis-24">
              <p className="text-xs text-tg-hint">{label}{status === "completed" ? <span aria-label="Выполнено" className="ml-1">✓</span> : null}</p>
              <p className="font-medium">{status === "skipped" ? "Пропущено" : blockedPart ? "Ожидает" : executionSetLabel(exercise, input)}</p>
            </div>
            {status !== "skipped" ? <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" aria-label={editLabel} disabled={busy || blockedPart} className="min-h-11 rounded-lg bg-tg-secondary px-2.5 text-xs font-medium disabled:opacity-40"
                onClick={event => onEdit(entry, event.currentTarget)}>Править</button>
              {(viewed || entry.kind === "standard") && status === "pending" ? <button type="button" disabled={busy || resting || blockedPart || invalidRestIds.includes(entry.id) || executionInputError(entry, draft, input, exercise) !== null}
                aria-label={viewed ? undefined : `Готово: подход ${entry.setNumber}`}
                className="app-button app-gradient-action min-h-11 rounded-lg px-2.5 py-1 text-xs disabled:opacity-50"
                onClick={() => onComplete(entry, draft, input)}>Готово</button> : null}
            </div> : null}
          </div>;
        })}
      </li>;
    })}
  </ol>;
}
