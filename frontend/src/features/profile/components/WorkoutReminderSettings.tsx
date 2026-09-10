import { Link } from "react-router-dom";

type Props = {
  enabled: boolean;
  startTime: string;
  remindBeforeMinutes: number;
  days: number[];
  onEnabledChange: (value: boolean) => void;
  onLeadChange: (value: number) => void;
};

const WEEKDAYS = [
  { id: 0, label: "Пн" },
  { id: 1, label: "Вт" },
  { id: 2, label: "Ср" },
  { id: 3, label: "Чт" },
  { id: 4, label: "Пт" },
  { id: 5, label: "Сб" },
  { id: 6, label: "Вс" },
];

const LEAD_OPTIONS = [
  [0, "В момент начала"],
  [15, "За 15 минут"],
  [30, "За 30 минут"],
  [60, "За 1 час"],
  [120, "За 2 часа"],
  [180, "За 3 часа"],
  [720, "За 12 часов"],
  [1440, "За сутки"],
] as const;

export function WorkoutReminderSettings({
  enabled,
  startTime,
  remindBeforeMinutes,
  days,
  onEnabledChange,
  onLeadChange,
}: Props) {
  const scheduleLabel = WEEKDAYS
    .filter((day) => days.includes(day.id))
    .map((day) => day.label)
    .join(", ");

  return (
    <div className="space-y-3 rounded-2xl bg-tg-secondary p-4">
      <label className="flex items-center justify-between text-sm">
        <span>Тренировки по расписанию</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
        />
      </label>
      <p className="text-xs text-tg-hint">
        Напоминание придёт относительно времени из постоянного расписания.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs text-tg-hint">
          Когда напомнить
          <select
            value={remindBeforeMinutes}
            onChange={(event) => onLeadChange(Number(event.target.value))}
            className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-base"
          >
            {LEAD_OPTIONS.map(([minutes, label]) => (
              <option key={minutes} value={minutes}>{label}</option>
            ))}
          </select>
        </label>
        <div className="rounded-xl bg-tg-bg px-3 py-2">
          <p className="text-xs text-tg-hint">Постоянное расписание</p>
          <p className="mt-0.5 text-sm font-medium">
            {scheduleLabel || "Дни не выбраны"} · {startTime.slice(0, 5)}
          </p>
        </div>
      </div>
      <Link to="/train#schedule" className="inline-flex min-h-[44px] items-center text-xs font-medium text-tg-link">
        Изменить расписание в тренировках →
      </Link>
    </div>
  );
}
