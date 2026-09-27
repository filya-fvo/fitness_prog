import { AppCard } from "@/components/ui/AppCard";
import { activityCards, type HabitDay } from "@/utils/habits";

type Props = {
  day: HabitDay;
  waterTargetMl?: number | null;
  onOpen: (metric: "sleep" | "water" | "steps") => void;
};

const icons = {
  sleep: "☾",
  water: "◒",
  steps: "↗",
};

/** Three concise entrypoints so daily metrics do not compete with the workout module. */
export function DailyActivityCards({ day, waterTargetMl, onOpen }: Props) {
  const cards = activityCards(day, { waterMl: waterTargetMl ?? undefined });
  return (
    <section aria-labelledby="daily-activity-title">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div>
          <p className="section-kicker">Сегодня</p>
          <h2 id="daily-activity-title" className="text-lg font-semibold">Самочувствие</h2>
        </div>
        <p className="text-xs text-tg-hint">Нажмите, чтобы заполнить</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {cards.map((card) => (
          <AppCard key={card.id} tone={card.id === "water" ? "ocean" : "indigo"} className="min-w-0 p-0">
            <button
              type="button"
              onClick={() => onOpen(card.id)}
              aria-label={`Заполнить: ${card.label}`}
              className="app-activity-card tap-target min-h-[130px] w-full p-3 text-left"
            >
              <span aria-hidden="true" className="mb-3 grid h-8 w-8 place-items-center rounded-xl bg-black/15 text-lg text-white">
                {icons[card.id]}
              </span>
              <span className="block text-xs text-tg-hint">{card.label}</span>
              <strong className="mt-1 block text-base leading-tight">{card.value}</strong>
              <span className="mt-2 block h-1 overflow-hidden rounded-full bg-black/15">
                <span
                  className="app-brand-progress block h-full rounded-full"
                  style={{ width: `${Math.round((card.progress ?? 0) * 100)}%` }}
                />
              </span>
            </button>
          </AppCard>
        ))}
      </div>
    </section>
  );
}
