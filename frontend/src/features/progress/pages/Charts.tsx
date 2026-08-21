import type { DayVolume } from "@/utils/progress";

type ChartsProps = {
  series: DayVolume[];
};

export function Charts({ series }: ChartsProps) {
  const max = Math.max(1, ...series.map((d) => d.volume));
  const total = series.reduce((sum, day) => sum + day.volume, 0);
  const workouts = series.reduce((sum, day) => sum + day.workouts, 0);
  const activeDays = series.filter((day) => day.workouts > 0);
  const best = activeDays.reduce<DayVolume | null>((current, day) => !current || day.volume > current.volume ? day : current, null);
  const average = workouts ? total / workouts : 0;

  return (
    <section className="rounded-2xl bg-tg-secondary p-4">
      <h2 className="text-sm font-semibold">Тренировки: объём нагрузки</h2>
      <p className="mt-1 text-xs text-tg-hint">
        Сумма «вес × повторы» по завершённым подходам за 14 дней. Показывает, насколько
        тяжёлыми были тренировки, а не калории.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-tg-bg p-2"><p className="text-[10px] text-tg-hint">Тренировок</p><p className="mt-1 text-sm font-semibold tabular-nums">{workouts}</p></div>
        <div className="rounded-xl bg-tg-bg p-2"><p className="text-[10px] text-tg-hint">Средний объём</p><p className="mt-1 text-sm font-semibold tabular-nums">{Math.round(average).toLocaleString("ru-RU")}</p></div>
        <div className="rounded-xl bg-tg-bg p-2"><p className="text-[10px] text-tg-hint">Лучший день</p><p className="mt-1 text-sm font-semibold tabular-nums">{best ? best.date.slice(8) : "—"}</p></div>
      </div>
      <div className="relative mt-4 flex h-40 items-end gap-1 border-b border-white/10 pt-5">
        <span className="pointer-events-none absolute left-0 top-0 text-[9px] text-tg-hint">{Math.round(max).toLocaleString("ru-RU")}</span>
        <span className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-white/10" />
        {series.map((day) => {
          const height = day.workouts ? Math.max(5, Math.round((day.volume / max) * 100)) : 2;
          return (
            <div key={day.date} className="flex flex-1 flex-col items-center justify-end gap-1">
              <div
                className={day.workouts ? "relative w-full rounded-t bg-gradient-to-t from-blue-600/80 to-cyan-400/90" : "w-full rounded-t bg-white/10"}
                style={{ height: `${height}%` }}
                title={`${day.date}: ${day.volume.toFixed(0)} кг·повт.`}
              >{day.workouts ? <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] text-tg-hint">{day.volume >= 1000 ? `${(day.volume / 1000).toFixed(1)}к` : Math.round(day.volume)}</span> : null}</div>
              <span className="text-[9px] text-tg-hint">{day.date.slice(8)}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-tg-hint">
        Всего: {Math.round(total).toLocaleString("ru-RU")} кг·повт. · активных дней: {activeDays.length}
      </p>
    </section>
  );
}
