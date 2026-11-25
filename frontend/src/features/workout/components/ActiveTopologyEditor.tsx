import { useEffect, useRef, useState, type ReactNode } from "react";
import axios from "axios";
import {
  applyActiveWorkoutTopology, previewActiveWorkoutTopology,
  type ActiveWorkoutTopologyApply, type ActiveWorkoutTopologyRequest,
} from "@/api/activeWorkoutTopology";
import { beginActiveTopology, clearRejectedTopology, finishActiveTopology, readPendingTopology } from "@/db/workoutExecution";
import { flushSyncQueue } from "@/db/syncQueue";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import { useWorkoutStore } from "@/store/workoutStore";
import type { Exercise, WorkoutGroup, WorkoutPlan, WorkoutPlanExercise } from "@/types/workout";
import { isOnline } from "@/utils/network";
import { toUserMessage } from "@/utils/errors";
import { rankWorkoutReplacementOptions } from "@/utils/exerciseAlternatives";
import { WorkoutReplacementPicker } from "./WorkoutReplacementPicker";
import { workoutActionStyles } from "./workoutActionStyles";

export type TopologyControls = { add: ReactNode; replace: ReactNode; settings: ReactNode };

type Props = {
  owner: string; client: string; server: string; plan: WorkoutPlan; row: WorkoutPlanExercise;
  group?: WorkoutGroup; exercise?: Exercise; activeRest: boolean; onOpenChange: (open: boolean) => void;
  confirmDiscardInput: () => Promise<boolean>;
  children: (controls: TopologyControls) => ReactNode;
};
type Action = ActiveWorkoutTopologyRequest["action"];
type Selection = { action: Action; subject: string; revision: number; source?: Exercise; opener: HTMLButtonElement };
const button = "min-h-11 rounded-xl border border-tg-hint/25 px-3 text-sm disabled:opacity-40";

export function ActiveTopologyEditor({ owner, client, server, plan, row, group, exercise, activeRest, onOpenChange, confirmDiscardInput, children }: Props) {
  const catalog = useWorkoutStore(state => state.catalog);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [count, setCount] = useState("");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewActiveWorkoutTopology>> | null>(null);
  const [pending, setPending] = useState<ActiveWorkoutTopologyApply | null>(null);
  const [retry, setRetry] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(isOnline);
  const open = selection !== null || pending !== null;
  const savedSets = useWorkoutStore(state => state.activeWorkout?.sets);
  const occupiedIds = new Set([...plan.exercises.map(item => item.exercise_id), ...(savedSets ?? []).map(item => item.exercise_id)]);

  useEffect(() => {
    const update = () => setOnline(isOnline());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    let current = true;
    void readPendingTopology(owner, client).then(value => {
      if (current && value) { setPending(value); setRetry(true); }
    }).catch(() => { if (current) setError("Не удалось проверить сохранённое изменение плана"); });
    return () => { current = false; };
  }, [owner, client]);

  function close() {
    if (inFlight.current || retry) return;
    setSelection(null); setPreview(null); setPending(null); setError(null);
  }
  const ref = useModalAccessibility(open, close, selection?.opener);
  useEffect(() => {
    onOpenChange(open);
    return () => onOpenChange(false);
  }, [open, onOpenChange]);

  async function requestPreview(next?: Exercise) {
    if (!selection || inFlight.current) return;
    const adding = selection.action === "append_exercise";
    const resizing = selection.action.startsWith("resize_");
    if (adding && !next) return;
    inFlight.current = true; setBusy(true); setError(null);
    const payload: ActiveWorkoutTopologyRequest = {
      operation_id: crypto.randomUUID(), action: selection.action, subject_id: adding && next ? next.id : selection.subject,
      expected_plan_revision: selection.revision,
      ...(next && !adding ? { replacement_exercise_id: next.id } : {}),
      ...(resizing ? { target_count: Number(count) } : {}),
    };
    try {
      await flushSyncQueue(owner);
      const result = await previewActiveWorkoutTopology(server, payload);
      setPreview(result);
      setPending({ ...payload, preview_fingerprint: result.preview_fingerprint });
    } catch (err) { setError(toUserMessage(err, "Не удалось подготовить изменение")); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function save() {
    if (!pending || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      if (!await beginActiveTopology(owner, client, pending)) {
        setPending(null); setPreview(null); setSelection(null); setRetry(false);
        setError("План обновился в другой вкладке. Откройте изменение снова.");
        inFlight.current = false; setBusy(false);
        return;
      }
    } catch (err) {
      setError(toUserMessage(err, "Сначала синхронизируйте записанные подходы"));
      inFlight.current = false; setBusy(false); return;
    }
    try {
      const workout = await applyActiveWorkoutTopology(server, pending);
      const session = await finishActiveTopology(owner, client, pending.operation_id, workout);
      useWorkoutStore.getState().applyExecutionSession(session);
      setSelection(null); setPreview(null); setPending(null); setRetry(false);
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 409 || status === 422 || status === 404) {
        try {
          await clearRejectedTopology(owner, client, pending.operation_id);
        } catch {
          setRetry(true);
          setError("Не удалось сверить сохранённое изменение. Повторите отправку.");
          return;
        }
        setPending(null); setPreview(null); setRetry(false);
        setError(toUserMessage(err, "Проверьте актуальный план и повторите действие"));
      } else {
        setRetry(true);
        setError("Ответ не получен. Повторите то же изменение после восстановления связи");
      }
    } finally { inFlight.current = false; setBusy(false); }
  }

  const controlsDisabled = activeRest || !online || busy || retry;
  async function edit(action: Action, opener: HTMLButtonElement) {
    if (!await confirmDiscardInput()) return;
    const wholeGroup = action.endsWith("group");
    setSelection({
      action, subject: wholeGroup && group ? group.id : row.exercise_id, revision: plan.active_plan_revision ?? 0,
      source: action === "replace_member" ? exercise : undefined,
      opener,
    });
    setCount(String(group?.rounds ?? row.target_sets)); setError(null);
  }

  const actionButton = (action: Action, label: string, className: string) => (
    <button type="button" className={className} disabled={controlsDisabled}
      onClick={event => void edit(action, event.currentTarget)}>{label}</button>
  );
  return <>
    {children({
      add: actionButton("append_exercise", "Добавить упражнение", workoutActionStyles.addExercise),
      replace: actionButton("replace_member", "Заменить", workoutActionStyles.replace),
      settings: <>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Настройки текущей тренировки">
          {group ? actionButton("replace_group", "Заменить связку", workoutActionStyles.pill) : null}
          {actionButton(group ? "resize_group" : "resize_exercise", group ? "Изменить раунды" : "Изменить подходы", workoutActionStyles.pill)}
          {group ? actionButton("dissolve_group", "Распустить связку", workoutActionStyles.pill) : null}
        </div>
        {!open && error ? <p role="alert" className="text-sm text-[var(--app-danger)]">{error}</p> : null}
        {!online && !open ? <p className="text-xs text-tg-hint">Изменение плана доступно в сети.</p> : null}
      </>,
    })}
    {open ? <div role="dialog" aria-modal="true" aria-labelledby="active-topology-title"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-3 sm:items-center">
      <section ref={ref} tabIndex={-1} className="app-card max-h-[90dvh] w-full max-w-lg space-y-3 overflow-y-auto p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 id="active-topology-title" className="text-lg font-semibold">
            {selection?.action === "append_exercise" ? "Добавить упражнение" : selection?.action === "replace_member" ? "Замена упражнения" : selection?.action === "replace_group" ? "Замена связки" : selection?.action === "dissolve_group" ? "Распустить связку" : "Изменить текущую тренировку"}
          </h2>
          <button type="button" disabled={busy || retry} className={button} onClick={close}>Закрыть</button>
        </div>
        {error ? <p role="alert" className="text-sm text-[var(--app-danger)]">{error}</p> : null}
        {pending ? <>
          {retry ? <p>Изменение ожидает подтверждения сервера.</p> : <>
            <p className="text-sm">Записанные результаты останутся в истории тренировки.</p>
            <ul className="space-y-1 text-sm">{preview?.plan.exercises.map(item =>
              <li key={item.exercise_id}>{item.name_ru ?? catalog.find(exercise => exercise.id === item.exercise_id)?.name_ru ?? "Упражнение"} · {item.active_set_numbers?.length ?? item.target_sets} подх.</li>)}</ul>
            <button type="button" disabled={busy} className={button} onClick={() => { setPending(null); setPreview(null); }}>Назад</button>
          </>}
          <button type="button" disabled={busy || !online} className={button} onClick={() => void save()}>{retry ? "Повторить отправку" : "Применить изменение"}</button>
        </> : selection && (selection.action.startsWith("replace") || selection.action === "append_exercise") ? <fieldset disabled={busy || !online}>
          {selection.source ? <p className="mb-3 text-xs text-tg-hint">Сейчас: {selection.source.name_ru}</p> : null}
          <WorkoutReplacementPicker source={selection.source} catalog={catalog} occupiedIds={occupiedIds}
            recommended={rankWorkoutReplacementOptions(selection.source, catalog, occupiedIds)}
            onChoose={item => void requestPreview(item)} />
        </fieldset> : selection?.action === "dissolve_group" ? <>
          <p className="text-sm">Упражнения будут выполняться по отдельности. Записанные подходы и настройки дроп-сетов и кластеров сохранятся.</p>
          <button type="button" className={button} disabled={busy || !online} onClick={() => void requestPreview()}>Проверить изменение</button>
        </> : selection ? <>
          <label className="block text-sm">{selection.action === "resize_group" ? "Число раундов" : "Число подходов"}
            <input className="app-field mt-1 block min-h-11 w-full text-base" type="number" min={1} max={20}
              disabled={busy} value={count} onChange={event => setCount(event.target.value)} />
          </label>
          <button type="button" className={button} disabled={busy || !online || !/^([1-9]|1\d|20)$/.test(count)} onClick={() => void requestPreview()}>Проверить изменение</button>
        </> : null}
      </section>
    </div> : null}
  </>;
}
