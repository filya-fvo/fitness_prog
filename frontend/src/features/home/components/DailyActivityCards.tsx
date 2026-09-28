import { AppCard } from "@/components/ui/AppCard";
import { activityCards, type HabitDay } from "@/utils/habits";

type Props = {
  day: HabitDay;
  waterTargetMl?: number | null;
  onOpen: (metric: "sleep" | "water" | "steps") => void;
};

const colors = { sleep: "text-violet-400", water: "text-cyan-400", steps: "text-teal-400" };
const bars = { sleep: "bg-sky-400", water: "bg-cyan-400", steps: "bg-teal-400" };

export function ActivityIcon({ kind }: { kind: "sleep" | "water" | "steps" }) {
  const paths = {
    sleep: <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />,
    water: <path d="M12 2C9.3 6.3 5 10.2 5 14a7 7 0 0 0 14 0c0-3.8-4.3-7.7-7-12Z" />,
    steps: <path d="m3 15 3.3-3.5 3.1 2.2 3.4-5.1 2.5 1.2-1 5.2h2.4c1.4 0 2.1 1.7 4.3 1.7h1v3.1H3a2 2 0 0 1 0-3.8Z" />,
  };
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">{paths[kind]}</svg>;
}

/** Three concise entrypoints so daily metrics do not compete with the workout module. */
export function DailyActivityCards({ day, waterTargetMl, onOpen }: Props) {
  const cards = activityCards(day, { waterMl: waterTargetMl ?? undefined });
  return (
    <section aria-labelledby="daily-activity-title">
      <h2 id="daily-activity-title" className="mb-2 text-base font-semibold">Сегодня</h2>
      <div className="grid grid-cols-3 gap-2">
        {cards.map((card) => (
          <AppCard key={card.id} tone="indigo" className="home-activity-tile min-w-0 p-0">
            <button
              type="button"
              onClick={() => onOpen(card.id)}
              aria-label={`Заполнить: ${card.label}`}
              className="app-activity-card tap-target relative flex min-h-[160px] w-full flex-col p-3 text-left"
            >
              <span aria-hidden="true" className={`mb-2 ${colors[card.id]}`}>
                <ActivityIcon kind={card.id} />
              </span>
              <span className="block text-xs font-medium">{card.label}</span>
              <strong className="mt-1 block text-sm leading-tight sm:text-base">{card.value}</strong>
              <span className="mt-1 block text-[11px] text-tg-hint">{card.detail}</span>
              <span className="mt-auto block h-1.5 w-full overflow-hidden rounded-full bg-slate-700/70">
                <span
                  className={`block h-full rounded-full ${bars[card.id]}`}
                  style={{ width: `${Math.round((card.progress ?? 0) * 100)}%` }}
                />
              </span>
              <span aria-hidden="true" className="mt-1 self-end text-sm text-tg-hint">›</span>
            </button>
          </AppCard>
        ))}
      </div>
    </section>
  );
}
