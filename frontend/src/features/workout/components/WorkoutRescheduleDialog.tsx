import { useMemo, useState } from "react";

import {
  previewWorkoutScheduleReplacement,
  replaceWorkoutScheduleDay,
  rescheduleWorkout,
  type WorkoutScheduleOccurrence,
  type WorkoutScheduleOverview,
  type WorkoutScheduleReplacementPreview,
} from "@/api/workouts";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import { toUserMessage } from "@/utils/errors";

type Props = {
  overview: WorkoutScheduleOverview;
  occurrence: WorkoutScheduleOccurrence;
  initialDate: string;
  onClose: () => void;
  onChange: (overview: WorkoutScheduleOverview) => void;
};

type Mode = "once" | "permanent";
type EffectiveScope = "current_week" | "next_week";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" })
    .format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function weekEnd(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() + 6 - mondayOffset);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function daysLabel(days: number[]): string {
  return days.map((day) => WEEKDAYS[day]).join(" · ");
}

export function WorkoutRescheduleDialog({ overview, occurrence, initialDate, onClose, onChange }: Props) {
  const [mode, setMode] = useState<Mode>("once");
  const [targetDate, setTargetDate] = useState(initialDate);
  const [targetTime, setTargetTime] = useState(occurrence.start_time.slice(0, 5));
  const [effectiveScope, setEffectiveScope] = useState<EffectiveScope>("current_week");
  const [conflictResolution, setConflictResolution] = useState<"reduce" | null>(null);
  const [preview, setPreview] = useState<WorkoutScheduleReplacementPreview | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalAccessibility(true, onClose);
  const permanentMax = useMemo(() => weekEnd(occurrence.original_date), [occurrence.original_date]);

  function resetPreview() {
    setPreview(null);
    setIdempotencyKey(null);
    setConflictResolution(null);
    setError(null);
  }

  async function submitOnce() {
    if (!targetDate || !targetTime || saving) return;
    setSaving(true);
    setError(null);
    try {
      onChange(await rescheduleWorkout({
        originalDate: occurrence.original_date,
        targetDate,
        targetTime,
      }));
      onClose();
    } catch (err) {
      setError(toUserMessage(err, "Не удалось перенести тренировку"));
    } finally {
      setSaving(false);
    }
  }

  async function loadPreview() {
    if (!targetDate || !targetTime || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await previewWorkoutScheduleReplacement({
        originalDate: occurrence.original_date,
        targetDate,
        targetTime,
        effectiveScope,
      });
      setPreview(result);
      setIdempotencyKey(crypto.randomUUID());
    } catch (err) {
      setError(toUserMessage(err, "Не удалось проверить новое расписание"));
    } finally {
      setSaving(false);
    }
  }

  async function applyPermanent() {
    if (!preview || !idempotencyKey || saving) return;
    if (preview.requires_conflict_resolution && conflictResolution !== "reduce") {
      setError("Подтвердите удаление исходного дня или выберите разовый перенос.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await replaceWorkoutScheduleDay({
        originalDate: occurrence.original_date,
        targetDate,
        targetTime,
        effectiveScope,
        conflictResolution,
        expectedRevision: preview.schedule_revision,
        idempotencyKey,
      });
      onChange(result.overview);
      onClose();
    } catch (err) {
      setError(toUserMessage(err, "Не удалось изменить постоянное расписание"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="reschedule-workout-title" tabIndex={-1} className="max-h-[92dvh] w-full min-w-0 max-w-md overflow-y-auto rounded-2xl bg-tg-bg p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 id="reschedule-workout-title" className="text-base font-semibold">Перенести тренировку</h3>
            <p className="mt-1 break-words text-xs text-tg-hint [overflow-wrap:anywhere]">{occurrence.title}</p>
          </div>
          <button type="button" aria-label="Закрыть" onClick={onClose} className="min-h-[44px] min-w-[44px] text-tg-hint">✕</button>
        </div>

        <fieldset className="mt-3 space-y-2">
          <legend className="text-xs font-medium">Как перенести?</legend>
          <label className="flex min-h-[44px] items-center gap-3 rounded-xl bg-tg-secondary px-3 py-2 text-sm">
            <input type="radio" name="move-mode" checked={mode === "once"} onChange={() => { setMode("once"); resetPreview(); }} />
            Только эту тренировку
          </label>
          <label className="flex min-h-[44px] items-center gap-3 rounded-xl bg-tg-secondary px-3 py-2 text-sm">
            <input type="radio" name="move-mode" checked={mode === "permanent"} onChange={() => { setMode("permanent"); resetPreview(); }} />
            Заменить день постоянно
          </label>
        </fieldset>

        <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="min-w-0 text-xs text-tg-hint">
            Новый день
            <input type="date" value={targetDate} min={mode === "once" && occurrence.original_date > overview.requested_date ? occurrence.original_date : overview.requested_date} max={mode === "once" ? occurrence.reschedule_until ?? undefined : permanentMax} onChange={(event) => { setTargetDate(event.target.value); resetPreview(); }} className="mt-1 min-h-[44px] min-w-0 w-full rounded-xl border border-tg-hint/20 bg-tg-secondary px-3 py-2.5 text-base text-tg-text" />
          </label>
          <label className="min-w-0 text-xs text-tg-hint">
            Время начала
            <input type="time" value={targetTime} onChange={(event) => { setTargetTime(event.target.value); resetPreview(); }} className="mt-1 min-h-[44px] min-w-0 w-full rounded-xl border border-tg-hint/20 bg-tg-secondary px-3 py-2.5 text-base text-tg-text" />
          </label>
        </div>

        {mode === "permanent" ? (
          <fieldset className="mt-3 space-y-2">
            <legend className="text-xs font-medium">Когда изменить график?</legend>
            <label className="flex min-h-[44px] items-center gap-3 text-sm">
              <input type="radio" name="effective-scope" checked={effectiveScope === "current_week"} onChange={() => { setEffectiveScope("current_week"); resetPreview(); }} />
              С этой недели и перенести выбранную тренировку
            </label>
            <label className="flex min-h-[44px] items-center gap-3 text-sm">
              <input type="radio" name="effective-scope" checked={effectiveScope === "next_week"} onChange={() => { setEffectiveScope("next_week"); resetPreview(); }} />
              Со следующей недели
            </label>
          </fieldset>
        ) : (
          <p className="mt-3 rounded-xl bg-tg-secondary px-3 py-2 text-xs text-tg-hint">Постоянные дни останутся без изменений.</p>
        )}

        {preview ? (
          <div className="mt-3 rounded-xl border border-tg-button/20 bg-tg-secondary p-3 text-xs">
            <p><span className="text-tg-hint">Было:</span> {daysLabel(preview.previous_days)}</p>
            <p className="mt-1"><span className="text-tg-hint">Станет:</span> {daysLabel(preview.new_days)} · {preview.start_time.slice(0, 5)}</p>
            <p className="mt-1 text-tg-hint">Ближайшие занятия: {preview.upcoming_dates.map(formatDate).join(", ")}</p>
            {preview.warning ? <p className="mt-2 text-amber-700 dark:text-amber-300">{preview.warning}</p> : null}
            {preview.requires_conflict_resolution ? (
              <label className="mt-2 flex min-h-[44px] items-center gap-3 rounded-lg bg-tg-bg px-2 py-1.5">
                <input type="checkbox" checked={conflictResolution === "reduce"} onChange={(event) => { setConflictResolution(event.target.checked ? "reduce" : null); setError(null); }} />
                Убрать {WEEKDAYS[preview.source_weekday]} и оставить {WEEKDAYS[preview.target_weekday]}
              </label>
            ) : null}
          </div>
        ) : null}

        {error ? <p role="alert" className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-600">{error}</p> : null}
        {mode === "once" ? (
          <button type="button" disabled={saving || !targetDate || !targetTime} onClick={() => void submitOnce()} className="mt-4 min-h-[44px] w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-50">
            {saving ? "Сохраняем…" : "Перенести только эту тренировку"}
          </button>
        ) : preview ? (
          <button type="button" disabled={saving || (preview.requires_conflict_resolution && conflictResolution !== "reduce")} onClick={() => void applyPermanent()} className="mt-4 min-h-[44px] w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-50">
            {saving ? "Сохраняем…" : "Подтвердить новое расписание"}
          </button>
        ) : (
          <button type="button" disabled={saving || !targetDate || !targetTime} onClick={() => void loadPreview()} className="mt-4 min-h-[44px] w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-50">
            {saving ? "Проверяем…" : "Показать новое расписание"}
          </button>
        )}
      </div>
    </div>
  );
}
