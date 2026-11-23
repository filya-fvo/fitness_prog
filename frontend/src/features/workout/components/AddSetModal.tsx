import { useId, useMemo, useState } from "react";

import { WheelPicker } from "@/components/WheelPicker";
import { SetWeightSelector } from "@/features/workout/components/SetWeightSelector";
import { DecimalInput } from "@/components/DecimalInput";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import type { Exercise, LocalSetDraft } from "@/types/workout";
import {
  buildCardioMachineParams,
  cardioMachineFields,
  initialCardioParamValues,
  type CardioParamKey,
} from "@/utils/cardioMachineParams";
import { rangeInts } from "@/utils/range";
import {
  type CardioMachineKind,
  type ExerciseLoadType,
  defaultTimedSeconds,
  formatDurationLabel,
  inferCardioMachineKind,
  inferLoadType,
} from "@/utils/exerciseLoadType";
import { exerciseWeightInput } from "@/utils/exerciseWeightRule";

type Props = {
  open: boolean;
  exercise: Exercise;
  /** Prefill from recommendation / last set */
  initial?: Partial<LocalSetDraft> | null;
  onClose: () => void;
  returnFocusTo?: HTMLElement;
  onApply: (draft: {
    reps: string;
    weight: string;
    weightMode: "total" | "per_hand" | null;
    durationSec: number | null;
    note: string | null;
    machineParams: Record<string, string | number> | null;
    restTimeSec: number;
    startTimer: boolean;
    isCompleted?: boolean;
    changedFields?: Array<"reps" | "weight" | "durationSec" | "restTimeSec" | "note" | "machineParams" | "isCompleted">;
  }) => void;
  /** Manual timer without completing a set */
  onStartTimerOnly?: (seconds: number) => void;
  defaultRestSec?: number;
  editing?: boolean;
  allowCompletionChange?: boolean;
  preserveWeightMode?: boolean;
  preserveWeightPrecision?: boolean;
  showTimerControls?: boolean;
  busy?: boolean;
  error?: string | null;
  subtitle?: string;
  applyLabel?: string;
  applyDisabled?: boolean;
  requireWeight?: boolean;
  preserveBlankWeight?: boolean;
  contextMessage?: string;
  onRefresh?: () => void;
};

function splitWeight(w: number): { whole: number; tenth: number } {
  const r = Math.max(0, Math.round(w * 100) / 100);
  const whole = Math.floor(r);
  const tenth = Math.floor((r - whole) * 10 + 1e-8);
  return { whole, tenth: Math.min(9, Math.max(0, tenth)) };
}

export function AddSetModal({
  open,
  exercise,
  initial,
  onClose,
  returnFocusTo,
  onApply,
  onStartTimerOnly,
  defaultRestSec = 60,
  editing = false,
  allowCompletionChange = editing,
  preserveWeightMode = editing,
  preserveWeightPrecision = true,
  showTimerControls = true,
  busy = false,
  error = null,
  subtitle,
  applyLabel = "Применить",
  applyDisabled = false,
  requireWeight = false,
  preserveBlankWeight = false,
  contextMessage,
  onRefresh,
}: Props) {
  const dialogRef = useModalAccessibility(open, () => { if (!busy) onClose(); }, returnFocusTo);
  const fieldId = useId();
  const loadType: ExerciseLoadType = useMemo(() => inferLoadType(exercise), [exercise]);
  const machineKind: CardioMachineKind = useMemo(
    () => inferCardioMachineKind(exercise),
    [exercise],
  );
  const machineFields = useMemo(() => cardioMachineFields(machineKind), [machineKind]);

  const initWeight = Number(initial?.weight) || 0;
  const { whole: w0, tenth: t0 } = splitWeight(initWeight);
  const initReps = Math.max(0, Math.round(initial?.reps ? Number(initial.reps) : requireWeight ? 0 : 10));
  const initDur =
    initial?.durationSec ??
    defaultTimedSeconds(exercise);

  const [reps, setReps] = useState(initReps);
  const [kgWhole, setKgWhole] = useState(w0);
  const [kgTenth, setKgTenth] = useState(t0);
  const [exactWeight, setExactWeight] = useState<number | null>(null);
  const [weightValid, setWeightValid] = useState(loadType !== "weight_reps" || !requireWeight || preserveBlankWeight || Boolean(initial?.weight));
  const [weightChosen, setWeightChosen] = useState((!requireWeight && !preserveBlankWeight) || Boolean(initial?.weight));
  const [min, setMin] = useState(Math.floor(initDur / 60));
  const [sec, setSec] = useState(initDur % 60);
  const [noteOpen, setNoteOpen] = useState(Boolean(initial?.note));
  const [note, setNote] = useState(String(initial?.note || ""));
  const [restSec, setRestSec] = useState(initial?.restTimeSec ?? defaultRestSec);
  const [startTimer, setStartTimer] = useState(true);
  const [isCompleted, setIsCompleted] = useState(initial?.isCompleted ?? true);
  const [changedFields, setChangedFields] = useState<NonNullable<Parameters<Props["onApply"]>[0]["changedFields"]>>([]);
  function markChanged(field: (typeof changedFields)[number]) {
    setChangedFields(current => current.includes(field) ? current : [...current, field]);
  }
  const weightInput = useMemo(() => exerciseWeightInput(exercise, preserveWeightMode ? initial?.weightMode ?? null : undefined), [exercise, preserveWeightMode, initial?.weightMode]);

  const [machineValues, setMachineValues] = useState(() =>
    initialCardioParamValues(initial?.machineParams),
  );

  if (!open) return null;

  const durationSec = Math.max(0, min * 60 + sec);
  const isTimed = loadType === "timed" || loadType === "cardio_machine";
  const weightStr =
    loadType === "weight_reps" && weightChosen
      ? exactWeight !== null ? String(exactWeight) : preserveWeightPrecision && initial?.weight && !changedFields.includes("weight") ? initial.weight
        : (Math.round((kgWhole + kgTenth / 10) * 10) / 10).toFixed(kgTenth ? 1 : 0).replace(/\.0$/, "")
      : "";

  function machineParams(): Record<string, string | number> | null {
    if (loadType !== "cardio_machine") return null;
    return buildCardioMachineParams(machineKind, machineValues);
  }

  function setMachineValue(key: CardioParamKey, value: string) {
    markChanged("machineParams");
    setMachineValues((current) => ({
      ...current,
      [key]: Number(value) || 0,
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 pb-[max(.75rem,env(safe-area-inset-bottom),var(--tg-safe-area-inset-bottom,0px))] sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby={`${fieldId}-title`}
        tabIndex={-1}
        className="app-card app-card-hero flex max-h-[min(92dvh,calc(100dvh-1.5rem-var(--tg-safe-area-inset-top,0px)-var(--tg-safe-area-inset-bottom,0px)))] w-full max-w-md flex-col overflow-hidden text-tg-text"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-2">
          <h3 id={`${fieldId}-title`} className="text-base font-semibold">{editing ? "Изменить подход" : "Добавить подход"}</h3>
          <button type="button" disabled={busy} aria-label="Закрыть" className="flex h-11 w-11 items-center justify-center text-sm text-tg-hint" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="mb-2 shrink-0 px-4 text-xs text-tg-hint">{exercise.name_ru}{subtitle ? ` · ${subtitle}` : ""}</p>

        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-2">
        <fieldset disabled={busy} {...(busy ? { inert: "" } : {})}>

        {loadType === "weight_reps" ? (
          <div>
          <div className="flex items-stretch gap-2">
            <div className="app-card app-card-inset min-w-0 flex-1 p-2">
              <div aria-hidden="true" className="mb-1 h-4" />
              <WheelPicker label="Повторения" value={reps} options={rangeInts(1, 40)} onChange={value => { setReps(value); markChanged("reps"); }} />
              <p className="mt-2 text-center text-lg font-semibold tabular-nums">{reps} повт.</p>
            </div>
            <SetWeightSelector label={weightInput.label} hint={weightInput.hint} whole={kgWhole} tenth={kgTenth}
              displayWeight={exactWeight ?? (preserveWeightPrecision && initial?.weight && !changedFields.includes("weight") ? Number(initial.weight) : undefined)}
              onChange={(whole, tenth, exact) => { setKgWhole(whole); setKgTenth(tenth); setExactWeight(exact ?? null); setWeightChosen(true); markChanged("weight"); }}
              onValidityChange={setWeightValid} hasWeight={weightChosen} />
          </div>
          </div>
        ) : null}

        {loadType === "reps_only" ? (
          <div className="flex justify-center">
            <WheelPicker label="Повторения" value={reps} options={rangeInts(1, 50)} onChange={value => { setReps(value); markChanged("reps"); }} />
          </div>
        ) : null}

        {loadType === "timed" || loadType === "cardio_machine" ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <WheelPicker label="Минуты" value={min} options={rangeInts(0, 90)} onChange={value => { setMin(value); markChanged("durationSec"); }} />
              <WheelPicker label="Секунды" value={sec} options={rangeInts(0, 59)} onChange={value => { setSec(value); markChanged("durationSec"); }} />
            </div>
            <p className="text-center text-xs text-tg-hint">
              {formatDurationLabel(durationSec)}
            </p>
            {loadType === "cardio_machine" ? (
              <div
                className={`grid gap-2 rounded-xl bg-tg-secondary p-3 text-xs ${
                  machineFields.length === 1 ? "grid-cols-1" : "grid-cols-2"
                }`}
              >
                {machineFields.map((field) => (
                  <label key={field.key} className="text-tg-hint">
                    {field.label}
                    <DecimalInput
                      step={field.step}
                      value={machineValues[field.key]}
                      onValueChange={(value) => setMachineValue(field.key, value)}
                      className="app-field mt-1 w-full"
                    />
                  </label>
                ))}
                {machineKind === "bike" ? (
                  <p className="col-span-2 text-[11px] text-tg-hint">
                    Укажите скорость и/или сопротивление по экрану тренажёра.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <details className="mt-2 text-xs text-tg-hint">
          <summary className="flex min-h-11 cursor-pointer items-center underline">Точный ввод {isTimed ? "времени" : "повторов"}</summary>
          <label htmlFor={`${fieldId}-exact`}>{isTimed ? "Время работы, с" : "Точное число повторений"}</label>
          <input id={`${fieldId}-exact`} type="number" inputMode="numeric" min={1} max={isTimed ? 86400 : 100000} step={1}
            className="app-field mt-1 min-h-11 w-full text-base" value={(isTimed ? durationSec : reps) || ""}
            onChange={event => {
              const value = Number(event.target.value);
              if (isTimed) {
                setMin(Math.floor(value / 60)); setSec(value % 60); markChanged("durationSec");
              } else {
                setReps(value); markChanged("reps");
              }
            }} />
        </details>
        <div className="mt-3 space-y-2">
          {!noteOpen ? (
            <button
              type="button"
              className="min-h-11 text-xs text-tg-hint underline"
              onClick={() => setNoteOpen(true)}
            >
              Добавить примечание
            </button>
          ) : (
            <label className="block text-xs text-tg-hint" htmlFor={`${fieldId}-note`}>
              Примечание (по желанию)
              <textarea
                id={`${fieldId}-note`}
                value={note}
                onChange={(e) => { setNote(e.target.value); markChanged("note"); }}
                placeholder="Добавить примечание (по желанию)"
                rows={2}
                maxLength={1000}
                className="app-field mt-1 w-full"
              />
            </label>
          )}

          {showTimerControls ? <div className="flex items-center justify-between gap-2 rounded-xl bg-tg-secondary px-3 py-2 text-xs">
            <label htmlFor={`${fieldId}-rest`} className="text-tg-hint">Отдых после подхода</label>
            <select
              id={`${fieldId}-rest`}
              value={restSec}
              onChange={(e) => { setRestSec(Number(e.target.value)); markChanged("restTimeSec"); }}
              className="app-field min-h-11 min-w-11 text-base"
            >
              {[...new Set([0, 30, 45, 60, 75, 90, 120, 150, 180, restSec])].sort((a, b) => a - b).map((s) => (
                <option key={s} value={s}>
                  {formatDurationLabel(s)}
                </option>
              ))}
            </select>
          </div> : null}

          {allowCompletionChange ? <label className="flex min-h-11 items-center gap-2 text-sm text-tg-hint">
            <input type="checkbox" checked={isCompleted} onChange={(e) => { setIsCompleted(e.target.checked); markChanged("isCompleted"); }} />
            Подход выполнен
          </label> : null}

          {showTimerControls ? <label className="flex min-h-11 items-center gap-2 text-xs text-tg-hint">
            <input
              type="checkbox"
              checked={startTimer}
              onChange={(e) => setStartTimer(e.target.checked)}
            />
            Запустить таймер после «Применить»
          </label> : null}

          {showTimerControls && onStartTimerOnly ? (
            <button
              type="button"
              className="min-h-11 w-full rounded-xl bg-white/10 px-3 py-2 text-sm"
              onClick={() =>
                onStartTimerOnly(
                  loadType === "timed" || loadType === "cardio_machine" ? durationSec || restSec : restSec,
                )
              }
            >
              ⏱ Только таймер
            </button>
          ) : null}
        </div>

        </fieldset>
        </div>
        <div className="shrink-0 space-y-2 px-4 pb-3 pt-2">
        {contextMessage ? <p className="text-xs text-tg-hint">{contextMessage}</p> : null}
        {error ? <p role="alert" className="text-sm text-[var(--app-danger)]">{error}</p> : null}
        {onRefresh ? <button type="button" onClick={onRefresh} className="min-h-11 text-sm font-medium text-tg-link">Обновить форму</button> : null}

        <button
          type="button"
          disabled={busy || !weightValid || applyDisabled || (isTimed ? !Number.isInteger(durationSec) || durationSec < 1 || durationSec > 86400 : !Number.isInteger(reps) || reps < 1 || reps > 100000)}
          className="app-button app-gradient-action w-full rounded-full"
          onClick={() =>
            onApply({
              reps:
                loadType === "weight_reps" || loadType === "reps_only" ? String(reps) : "",
              weight: loadType === "weight_reps" ? weightStr : "",
              weightMode: loadType === "weight_reps" ? weightInput.mode : null,
              durationSec:
                loadType === "timed" || loadType === "cardio_machine" ? durationSec : null,
              note: note.trim() || null,
              machineParams: machineParams(),
              restTimeSec: restSec,
              startTimer: showTimerControls && startTimer,
              ...(editing ? { isCompleted, changedFields } : {}),
            })
          }
        >
          {busy ? "Сохраняем…" : applyLabel}
        </button>
        </div>
      </div>
    </div>
  );
}
