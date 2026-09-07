import { useState } from "react";

import type { WorkoutScheduleSettings } from "@/api/workouts";

type Props = {
  settings: WorkoutScheduleSettings;
  disabled?: boolean;
  onSave: (input: { days: number[]; startTime: string }) => Promise<void>;
};

const WEEKDAYS = [
  { id: 0, label: "Пн" },
  { id: 1, label: "Вт" },
  { id: 2, label: "Ср" },
  { id: 3, label: "Чт" },
  { id: 4, label: "Пт" },
  { id: 5, label: "Сб" },
  { id: 6, label: "Вс" },
] as const;

export function WorkoutScheduleSettingsCard({ settings, disabled = false, onSave }: Props) {
  const [days, setDays] = useState(settings.days);
  const [startTime, setStartTime] = useState(settings.start_time.slice(0, 5));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const changed =
    startTime !== settings.start_time.slice(0, 5) ||
    days.join(",") !== settings.days.join(",");

  function toggleDay(day: number) {
    setMessage(null);
    setDays((current) => (
      current.includes(day)
        ? current.filter((candidate) => candidate !== day)
        : [...current, day].sort((a, b) => a - b)
    ));
  }

  async function save() {
    if (!days.length) {
      setMessage("Выберите хотя бы один тренировочный день.");
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
      setMessage("Укажите корректное время начала.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await onSave({ days, startTime });
      setMessage("Постоянное расписание сохранено.");
    } catch {
      setMessage("Не удалось сохранить расписание. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      id="schedule"
      tabIndex={-1}
      aria-labelledby="workout-schedule-title"
      className="scroll-mt-4 rounded-2xl bg-tg-secondary p-4 outline-none focus-visible:ring-2 focus-visible:ring-tg-button"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-tg-hint">Расписание</p>
      <h2 id="workout-schedule-title" className="mt-1 text-base font-semibold">
        Постоянные тренировочные дни
      </h2>
      <p className="mt-1 text-xs text-tg-hint">
        Эти дни формируют календарь тренировок. Напоминания настраиваются отдельно в профиле.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {WEEKDAYS.map((day) => (
          <button
            key={day.id}
            type="button"
            aria-pressed={days.includes(day.id)}
            disabled={disabled || saving}
            onClick={() => toggleDay(day.id)}
            className={[
              "min-h-[44px] min-w-[44px] rounded-full px-3 text-xs disabled:opacity-50",
              days.includes(day.id) ? "bg-tg-button text-tg-button-text" : "bg-tg-bg",
            ].join(" ")}
          >
            {day.label}
          </button>
        ))}
      </div>
      <label className="mt-3 block text-xs text-tg-hint">
        Время начала
        <input
          type="time"
          required
          value={startTime}
          disabled={disabled || saving}
          onChange={(event) => {
            setStartTime(event.target.value);
            setMessage(null);
          }}
          className="mt-1 min-h-[44px] w-full rounded-xl border border-black/10 bg-tg-bg px-3 py-2 text-base disabled:opacity-50"
        />
      </label>
      {message ? <p role="status" className="mt-2 text-xs text-tg-hint">{message}</p> : null}
      {disabled ? (
        <p className="mt-2 text-xs text-tg-hint">Изменение расписания доступно после подключения к интернету.</p>
      ) : null}
      <button
        type="button"
        disabled={disabled || saving || !changed}
        onClick={() => void save()}
        className="mt-3 min-h-[44px] w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-50"
      >
        {saving ? "Сохраняем…" : "Сохранить расписание"}
      </button>
      <p className="mt-2 text-[11px] text-tg-hint">
        Разовый перенос на главной по-прежнему меняет только одну тренировку.
      </p>
    </section>
  );
}
