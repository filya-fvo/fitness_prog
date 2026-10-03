import { ChartDataTable } from "@/components/ui/ChartDataTable";
import type { DayVolume } from "@/utils/progress";

type ChartsProps = { series: DayVolume[] };

export function Charts({ series }: ChartsProps) {
  const max = Math.max(1, ...series.map((d) => d.volume));
  const total = series.reduce((sum, day) => sum + day.volume, 0);
  const workouts = series.reduce((sum, day) => sum + day.workouts, 0);
  const activeDays = series.filter((day) => day.workouts > 0);
  const best = activeDays.reduce<DayVolume | null>((current, day) => !current || day.volume > current.volume ? day : current, null);
  const average = workouts ? total / workouts : 0;
  const dates = [0, Math.floor((series.length - 1) / 2), series.length - 1].filter((index, position, all) => index >= 0 && all.indexOf(index) === position);

  return (
    <section className="rounded-2xl bg-tg-secondary p-4">
      <h2 className="text-sm font-semibold">Тренировки: объём нагрузки</h2>
      <p className="mt-1 text-xs text-tg-hint">Сумма «вес × повторы» по завершённым подходам за 14 дней. Показывает, насколько тяжёлыми были тренировки, а не калории.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-tg-bg p-2"><p className="text-xs text-tg-hint">Тренировок</p><p className="mt-1 text-sm font-semibold tabular-nums">{workouts}</p></div>
        <div className="rounded-xl bg-tg-bg p-2"><p className="text-xs text-tg-hint">Средний объём</p><p className="mt-1 text-sm font-semibold tabular-nums">{Math.round(average).toLocaleString("ru-RU")}</p></div>
        <div className="rounded-xl bg-tg-bg p-2"><p className="text-xs text-tg-hint">Лучший день</p><p className="mt-1 text-sm font-semibold tabular-nums">{best ? best.date.slice(8) : "—"}</p></div>
      </div>
      <p className="mt-4 text-xs text-tg-hint">Шкала: 0–{Math.round(max).toLocaleString("ru-RU")} кг·повт.</p>
      <div className="relative mt-2 flex h-40 items-end gap-1 border-b border-[var(--border-subtle)]" role="img" aria-label="Объём нагрузки по дням">
        <span className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-[var(--border-subtle)]" />
        {series.map((day) => {
          const height = day.workouts ? Math.max(5, Math.round((day.volume / max) * 100)) : 2;
          return <div key={day.date} className="flex h-full min-w-0 flex-1 items-end">
            <div className={day.workouts ? "w-full rounded-t bg-gradient-to-t from-blue-600/80 to-cyan-400/90" : "w-full rounded-t bg-tg-hint/20"}
              style={{ height: `${height}%` }} title={`${day.date}: ${day.volume.toFixed(0)} кг·повт.`} />
          </div>;
        })}
      </div>
      <div className="mt-1 flex justify-between gap-2 text-xs text-tg-hint">{dates.map((index) => <span key={index}>{series[index].date.slice(5).split("-").reverse().join(".")}</span>)}</div>
      <p className="mt-3 text-xs text-tg-hint">Всего: {Math.round(total).toLocaleString("ru-RU")} кг·повт. · активных дней: {activeDays.length}</p>
      <ChartDataTable caption="Объём по дням" columns={["Дата", "Объём, кг·повт.", "Тренировки"]}
        rows={series.map((day) => ({ key: day.date, cells: [day.date, day.volume, day.workouts] }))} />
    </section>
  );
}
