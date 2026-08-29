import { useMemo, useState } from "react";

import {
  cancelScheduledWorkout,
  rescheduleWorkout,
  type WorkoutScheduleOccurrence,
  type WorkoutScheduleOverview,
} from "@/api/workouts";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import { confirmAction } from "@/lib/telegram";
import { toUserMessage } from "@/utils/errors";

type Props = {
  overview: WorkoutScheduleOverview | null;
  disabled?: boolean;
  onChange: (overview: WorkoutScheduleOverview) => void;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function shortTime(value: string): string {
  return value.slice(0, 5);
}

export function WorkoutSchedulePanel({ overview, disabled = false, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const occurrence = useMemo<WorkoutScheduleOccurrence | null>(() => {
    if (
      overview?.current?.status === "scheduled"
      || overview?.current?.status === "missed"
      || overview?.current?.status === "cancelled"
    ) {
      return overview.current;
    }
    return overview?.next ?? null;
  }, [overview]);
  const [targetDate, setTargetDate] = useState("");
  const [targetTime, setTargetTime] = useState("");
  const dialogRef = useModalAccessibility(open, () => setOpen(false));

  if (!overview || !occurrence) return null;
  const activeOverview = overview;
  const activeOccurrence = occurrence;

  const movedFromToday = overview.current?.status === "moved";
  const missedBeforeToday = overview.current?.status === "missed";
  const scheduledToday = overview.current?.status === "scheduled";
  const cancelledToday = overview.current?.status === "cancelled";
  const label = cancelledToday
    ? overview.next
      ? `Тренировка отменена · следующая ${formatDate(overview.next.target_date)} в ${shortTime(overview.next.start_time)}`
      : "Тренировка отменена"
    : movedFromToday
    ? `Перенесена на ${formatDate(activeOccurrence.target_date)}, ${shortTime(activeOccurrence.start_time)}`
    : missedBeforeToday
      ? `Пропущена ${formatDate(activeOccurrence.original_date)} — можно перенести`
    : scheduledToday
      ? `${activeOccurrence.is_override ? "Перенесена на сегодня" : "По расписанию сегодня"} в ${shortTime(activeOccurrence.start_time)}`
      : `Следующая: ${formatDate(activeOccurrence.target_date)} в ${shortTime(activeOccurrence.start_time)}`;

  function showDialog() {
    setTargetDate(missedBeforeToday ? activeOverview.requested_date : activeOccurrence.target_date);
    setTargetTime(shortTime(activeOccurrence.start_time));
    setError(null);
    setOpen(true);
  }

  async function submit() {
    if (!targetDate || !targetTime || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await rescheduleWorkout({
        originalDate: activeOccurrence.original_date,
        targetDate,
        targetTime,
      });
      onChange(updated);
      setOpen(false);
    } catch (err) {
      setError(toUserMessage(err, "Не удалось перенести тренировку"));
    } finally {
      setSaving(false);
    }
  }

  async function cancelOccurrence() {
    if (!activeOccurrence.can_cancel || saving) return;
    const nextLabel = activeOccurrence.cancel_to
      ? formatDate(activeOccurrence.cancel_to)
      : "следующий тренировочный день";
    const accepted = await confirmAction(
      `Отменить «${activeOccurrence.title}»?\nЭтот день программы перейдёт на ${nextLabel}.`,
    );
    if (!accepted) return;
    setSaving(true);
    setError(null);
    try {
      onChange(await cancelScheduledWorkout(activeOccurrence.target_date));
    } catch (err) {
      setError(toUserMessage(err, "Не удалось отменить тренировку"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-tg-button/20 bg-tg-bg/70 px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="break-words text-xs font-semibold leading-snug text-tg-link [overflow-wrap:anywhere]">{label}</p>
            <p className="mt-0.5 line-clamp-2 break-words text-[11px] leading-snug text-tg-hint [overflow-wrap:anywhere]">{occurrence.title}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {occurrence.can_reschedule ? (
              <button
                type="button"
                disabled={disabled || saving}
                onClick={showDialog}
                className="min-h-[44px] rounded-lg px-2 text-xs font-medium text-tg-link disabled:opacity-50"
              >
                Перенести
              </button>
            ) : null}
            {occurrence.can_cancel ? (
              <button
                type="button"
                disabled={disabled || saving}
                onClick={() => void cancelOccurrence()}
                className="min-h-[44px] rounded-lg px-2 text-xs font-medium text-amber-700 disabled:opacity-50 dark:text-amber-300"
              >
                Отменить
              </button>
            ) : null}
          </div>
        </div>
        {movedFromToday ? (
          <p className="mt-1 text-[10px] text-tg-hint">Обычное расписание следующих недель не изменится.</p>
        ) : null}
        {cancelledToday ? (
          <p className="mt-1 text-[10px] text-tg-hint">
            Порядок программы сохранён: эта тренировка станет следующей.
          </p>
        ) : null}
        {error && !open ? (
          <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>
        ) : null}
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reschedule-workout-title"
            tabIndex={-1}
            className="w-full min-w-0 max-w-md rounded-2xl bg-tg-bg p-4 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 id="reschedule-workout-title" className="text-base font-semibold">Перенести тренировку</h3>
                <p className="mt-1 break-words text-xs text-tg-hint [overflow-wrap:anywhere]">{occurrence.title}</p>
              </div>
              <button type="button" aria-label="Закрыть" onClick={() => setOpen(false)} className="min-h-[44px] min-w-[44px] text-tg-hint">✕</button>
            </div>
            <p className="mt-3 rounded-xl bg-tg-secondary px-3 py-2 text-xs text-tg-hint">
              Можно выбрать дату до следующей тренировки по графику. Постоянные дни останутся без изменений.
            </p>
            <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="min-w-0 text-xs text-tg-hint">
                Новый день
                <input
                  type="date"
                  value={targetDate}
                  min={activeOverview.requested_date > occurrence.original_date ? activeOverview.requested_date : occurrence.original_date}
                  max={occurrence.reschedule_until ?? undefined}
                  onChange={(event) => setTargetDate(event.target.value)}
                  className="mt-1 min-w-0 w-full rounded-xl border border-tg-hint/20 bg-tg-secondary px-3 py-2.5 text-base text-tg-text"
                />
              </label>
              <label className="min-w-0 text-xs text-tg-hint">
                Время начала
                <input
                  type="time"
                  value={targetTime}
                  onChange={(event) => setTargetTime(event.target.value)}
                  className="mt-1 min-w-0 w-full rounded-xl border border-tg-hint/20 bg-tg-secondary px-3 py-2.5 text-base text-tg-text"
                />
              </label>
            </div>
            {error ? <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-600">{error}</p> : null}
            <button
              type="button"
              disabled={saving || !targetDate || !targetTime}
              onClick={() => void submit()}
              className="mt-4 w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-50"
            >
              {saving ? "Сохраняем…" : "Перенести только эту тренировку"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
