import { useEffect, useMemo, useState } from "react";

import {
  assignWorkoutOccurrence,
  previewWorkoutAssignment,
  type WorkoutAssignmentPreview,
  type WorkoutScheduleOccurrence,
  type WorkoutScheduleOverview,
} from "@/api/workouts";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import { trackEvent } from "@/lib/analytics";
import { toUserMessage } from "@/utils/errors";

type Props = {
  source: WorkoutScheduleOccurrence;
  minDate: string;
  maxDate: string;
  onClose: () => void;
  onChange: (overview: WorkoutScheduleOverview) => void;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function initialTime(sourceTime: string, targetDate: string): string {
  const fallback = sourceTime.slice(0, 5);
  const now = new Date();
  const localDate = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  if (targetDate !== localDate) return fallback;
  const candidate = new Date(now.getTime() + 15 * 60 * 1000);
  const nextTime = `${String(candidate.getHours()).padStart(2, "0")}:${String(candidate.getMinutes()).padStart(2, "0")}`;
  return nextTime > fallback ? nextTime : fallback;
}

export function WorkoutAssignmentDialog({ source, minDate, maxDate, onClose, onChange }: Props) {
  const [targetDate, setTargetDate] = useState(minDate);
  const [targetTime, setTargetTime] = useState(() => initialTime(source.start_time, minDate));
  const [preview, setPreview] = useState<WorkoutAssignmentPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalAccessibility(true, onClose);
  const sourceLabel = useMemo(() => formatDate(source.target_date), [source.target_date]);

  useEffect(() => {
    let cancelled = false;
    setLoadingPreview(true);
    setError(null);
    void previewWorkoutAssignment({
      sourceOriginalDate: source.original_date,
      sourceTargetDate: source.target_date,
      targetDate,
    }).then((result) => {
      if (!cancelled) setPreview(result);
    }).catch((err) => {
      if (!cancelled) {
        setPreview(null);
        setError(toUserMessage(err, "Не удалось проверить выбранную дату"));
      }
    }).finally(() => {
      if (!cancelled) setLoadingPreview(false);
    });
    return () => {
      cancelled = true;
    };
  }, [source.original_date, source.target_date, targetDate]);

  async function submit() {
    if (!preview?.can_assign || !targetDate || !targetTime || saving) return;
    setSaving(true);
    setError(null);
    try {
      const overview = await assignWorkoutOccurrence({
        sourceOriginalDate: source.original_date,
        sourceTargetDate: source.target_date,
        targetDate,
        targetTime,
      });
      trackEvent("workout_assigned_earlier", {
        days_earlier: Math.round(
          (new Date(`${source.target_date}T12:00:00`).getTime() - new Date(`${targetDate}T12:00:00`).getTime())
          / 86_400_000,
        ),
      });
      onChange(overview);
      onClose();
    } catch (err) {
      setError(toUserMessage(err, "Не удалось назначить тренировку"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 p-3 sm:items-center" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-workout-title"
        tabIndex={-1}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-tg-bg p-4 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="assign-workout-title" className="text-base font-semibold">Назначить тренировку</h3>
            <p className="mt-1 text-xs text-tg-hint">{source.title}</p>
          </div>
          <button type="button" aria-label="Закрыть" onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-xl text-xl text-tg-hint">×</button>
        </div>

        <p className="mt-3 rounded-xl bg-tg-secondary px-3 py-2.5 text-xs leading-5 text-tg-hint">
          На выбранную дату добавится следующий день программы. Тренировка {sourceLabel} останется в календаре и после выполнения получит следующий день программы.
        </p>

        <label className="mt-3 block text-xs text-tg-hint">
          Дата
          <input
            type="date"
            min={minDate}
            max={maxDate}
            value={targetDate}
            onChange={(event) => {
              setTargetDate(event.target.value);
              setTargetTime(initialTime(source.start_time, event.target.value));
            }}
            className="mt-1 min-h-[44px] w-full rounded-xl border border-tg-hint/25 bg-tg-secondary px-3 text-base text-tg-text"
          />
        </label>
        <label className="mt-3 block text-xs text-tg-hint">
          Время
          <input
            type="time"
            value={targetTime}
            onChange={(event) => setTargetTime(event.target.value)}
            className="mt-1 min-h-[44px] w-full rounded-xl border border-tg-hint/25 bg-tg-secondary px-3 text-base text-tg-text"
          />
        </label>

        {loadingPreview ? <p className="mt-3 text-xs text-tg-hint">Проверяем дату…</p> : null}
        {preview?.warning ? <p role="alert" className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">{preview.warning}</p> : null}
        {error ? <p role="alert" className="mt-3 text-xs text-red-600">{error}</p> : null}

        <button
          type="button"
          disabled={saving || loadingPreview || !preview?.can_assign || !targetTime}
          onClick={() => void submit()}
          className="mt-4 min-h-[48px] w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-50"
        >
          {saving ? "Назначаем…" : `Назначить на ${formatDate(targetDate)}`}
        </button>
      </div>
    </div>
  );
}
