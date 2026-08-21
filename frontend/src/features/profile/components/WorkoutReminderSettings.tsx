type Props = {
  enabled: boolean;
  startTime: string;
  remindBeforeMinutes: number;
  days: number[];
  onEnabledChange: (value: boolean) => void;
  onStartTimeChange: (value: string) => void;
  onLeadChange: (value: number) => void;
  onToggleDay: (weekday: number) => void;
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
  onStartTimeChange,
  onLeadChange,
  onToggleDay,
}: Props) {
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
        Укажите время начала. Бот напомнит заранее и покажет название следующего дня программы.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-tg-hint">
          Начало тренировки
          <input
            type="time"
            value={startTime}
            onChange={(event) => onStartTimeChange(event.target.value)}
            className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-base"
          />
        </label>
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
      </div>
      <div>
        <p className="text-xs text-tg-hint">Постоянные дни</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {WEEKDAYS.map((day) => (
            <button
              key={day.id}
              type="button"
              aria-pressed={days.includes(day.id)}
              onClick={() => onToggleDay(day.id)}
              className={[
                "min-h-[44px] min-w-[44px] rounded-full px-3 text-xs",
                days.includes(day.id) ? "bg-tg-button text-tg-button-text" : "bg-tg-bg",
              ].join(" ")}
            >
              {day.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-tg-hint">
        Разовый перенос меняет только одну тренировку. Постоянные дни следующей недели сохраняются.
      </p>
    </div>
  );
}
