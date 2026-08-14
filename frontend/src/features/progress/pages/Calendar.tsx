import type { CalendarDay } from "@/utils/progress";
import { monthLabel } from "@/utils/progress";

type CalendarProps = {
  year: number;
  monthIndex: number;
  days: CalendarDay[];
  onPrev: () => void;
  onNext: () => void;
  onSelectDate: (date: string) => void;
};

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function statusClass(status: CalendarDay["status"]): string {
  switch (status) {
    case "completed":
      return "bg-tg-button text-tg-button-text";
    case "planned":
      return "bg-tg-bg border border-tg-button/40 text-tg-text";
    case "skipped":
      return "bg-black/10 text-tg-hint";
    default:
      return "bg-tg-bg text-tg-hint";
  }
}

export function Calendar({ year, monthIndex, days, onPrev, onNext, onSelectDate }: CalendarProps) {
  // Monday-first offset
  const firstWeekday = (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7;
  const blanks = Array.from({ length: firstWeekday });

  return (
    <section className="rounded-2xl bg-tg-secondary p-4">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={onPrev} className="rounded-lg px-2 py-1 text-sm text-tg-link">
          ←
        </button>
        <h2 className="text-sm font-semibold capitalize">{monthLabel(year, monthIndex)}</h2>
        <button type="button" onClick={onNext} className="rounded-lg px-2 py-1 text-sm text-tg-link">
          →
        </button>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] text-tg-hint">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {blanks.map((_, i) => (
          <div key={`b-${i}`} />
        ))}
        {days.map((day) => (
          <button
            type="button"
            key={day.date}
            onClick={() => onSelectDate(day.date)}
            className={`flex aspect-square items-center justify-center rounded-lg text-xs ${statusClass(day.status)}`}
            aria-label={`${day.date}: ${day.count ? `тренировок ${day.count}` : "нет тренировок"}`}
          >
            {Number(day.date.slice(8))}
            {day.count > 1 ? <span className="ml-0.5 text-[8px]">×{day.count}</span> : null}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-tg-hint">
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded bg-tg-button" /> выполнено
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded border border-tg-button/40" /> план
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded bg-black/10" /> пропуск
        </span>
      </div>
    </section>
  );
}
