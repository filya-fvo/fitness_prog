import type { DayVolume } from "@/utils/progress";

type ChartsProps = {
  series: DayVolume[];
};

export function Charts({ series }: ChartsProps) {
  const max = Math.max(1, ...series.map((d) => d.volume));

  return (
    <section className="rounded-2xl bg-tg-secondary p-4">
      <h2 className="text-sm font-semibold">Тренировки: объём нагрузки</h2>
      <p className="mt-1 text-xs text-tg-hint">
        Сумма «вес × повторы» по завершённым подходам за 14 дней. Показывает, насколько
        тяжёлыми были тренировки, а не калории.
      </p>
      <div className="mt-4 flex h-36 items-end gap-1">
        {series.map((day) => {
          const height = Math.max(4, Math.round((day.volume / max) * 100));
          return (
            <div key={day.date} className="flex flex-1 flex-col items-center justify-end gap-1">
              <div
                className="w-full rounded-t bg-tg-button/80"
                style={{ height: `${height}%` }}
                title={`${day.date}: ${day.volume.toFixed(0)} кг·повт.`}
              />
              <span className="text-[9px] text-tg-hint">{day.date.slice(8)}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-tg-hint">
        Всего: {series.reduce((a, d) => a + d.volume, 0).toFixed(0)} кг·повт. · тренировок:{" "}
        {series.reduce((a, d) => a + d.workouts, 0)}
      </p>
    </section>
  );
}
