import { useMemo, useState } from "react";

import {
  cancelScheduledWorkout,
  type WorkoutScheduleOccurrence,
  type WorkoutScheduleOverview,
} from "@/api/workouts";
import { WorkoutRescheduleDialog } from "@/features/workout/components/WorkoutRescheduleDialog";
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
    setError(null);
    setOpen(true);
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
        <WorkoutRescheduleDialog
          overview={activeOverview}
          occurrence={activeOccurrence}
          initialDate={missedBeforeToday ? activeOverview.requested_date : activeOccurrence.target_date}
          onClose={() => setOpen(false)}
          onChange={onChange}
        />
      ) : null}
    </>
  );
}
