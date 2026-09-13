import type { ProgressDashboard, ProgressDashboardPeriod } from "@/api/progressDashboard";

const PERIODS: ProgressDashboardPeriod[] = [28, 56, 84];

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
}

function signedDelta(current: number, previous: number, unit = ""): string {
  const delta = current - previous;
  if (delta === 0) return "как в прошлом периоде";
  return `${delta > 0 ? "+" : "−"}${formatNumber(Math.abs(delta))}${unit}`;
}

export function TrainingLoadAnalytics({
  data,
  loading,
  error,
  advanced,
  onPeriodChange,
}: {
  data: ProgressDashboard | null;
  loading: boolean;
  error: string | null;
  advanced: boolean;
  onPeriodChange: (period: ProgressDashboardPeriod) => void;
}) {
  const maxSets = Math.max(1, ...(data?.muscle_groups.map((item) => item.completed_sets) ?? [1]));
  return (
    <section className="rounded-2xl bg-tg-secondary p-4 md:col-span-2" aria-labelledby="training-load-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="training-load-title" className="text-sm font-semibold">Нагрузка и восстановление</h2>
          <p className="mt-0.5 text-[11px] text-tg-hint">Только завершённые подходы · пустые дни не считаются нулём</p>
        </div>
        <div className="grid grid-cols-3 rounded-xl bg-tg-bg p-1 text-[11px]" aria-label="Период нагрузки">
          {PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              aria-pressed={data?.period_days === period}
              onClick={() => onPeriodChange(period)}
              className={`min-h-11 rounded-lg px-2 ${data?.period_days === period ? "bg-tg-button font-semibold text-tg-button-text" : "text-tg-hint"}`}
            >
              {period / 7} нед.
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="mt-3 h-36 animate-pulse rounded-xl bg-tg-bg" /> : null}
      {error ? <p role="status" className="mt-3 rounded-xl bg-tg-bg p-3 text-xs text-amber-500">{error}</p> : null}
      {data && !loading ? (
        <>
          <p className="mt-3 text-[11px] text-tg-hint">
            {data.period_start.split("-").reverse().join(".")}–{data.period_end.split("-").reverse().join(".")} · {data.current.completed_workouts} тренировок
          </p>
          <div className={`mt-2 grid gap-2 ${advanced ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
            <div className="rounded-xl bg-tg-bg p-2.5">
              <p className="text-[10px] text-tg-hint">Подходы факт / план</p>
              <p className="mt-1 text-base font-semibold">{data.current.completed_sets} / {data.current.planned_sets || "—"}</p>
              <p className="text-[10px] text-tg-hint">факт: {signedDelta(data.current.completed_sets, data.previous.completed_sets)}</p>
            </div>
            <div className="rounded-xl bg-tg-bg p-2.5">
              <p className="text-[10px] text-tg-hint">Средний RPE</p>
              <p className="mt-1 text-base font-semibold">{data.current.average_rpe == null ? "—" : formatNumber(data.current.average_rpe)}</p>
              <p className="text-[10px] text-tg-hint">заполнено {data.current.rpe_workouts} из {data.current.completed_workouts}</p>
            </div>
            <div className="rounded-xl bg-tg-bg p-2.5">
              <p className="text-[10px] text-tg-hint">Активные дни</p>
              <p className="mt-1 text-base font-semibold">{data.current.active_days}</p>
              <p className="text-[10px] text-tg-hint">за выбранный период</p>
            </div>
            {advanced ? (
              <div className="rounded-xl bg-tg-bg p-2.5">
                <p className="text-[10px] text-tg-hint">Тоннаж</p>
                <p className="mt-1 text-base font-semibold">{formatNumber(data.current.volume_kg / 1000)} т</p>
                <p className="text-[10px] text-tg-hint">{signedDelta(data.current.volume_kg, data.previous.volume_kg, " кг")}</p>
              </div>
            ) : null}
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold">Рабочие подходы по группам</p>
            {data.muscle_groups.length ? (
              <ul className="mt-2 space-y-2">
                {data.muscle_groups.slice(0, advanced ? 8 : 5).map((item) => (
                  <li key={item.muscle_group}>
                    <div className="flex justify-between gap-3 text-[11px]">
                      <span className="truncate">{item.muscle_group}</span>
                      <span className="shrink-0 text-tg-hint">{item.completed_sets} подх. · {item.exercises} упр.</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-tg-bg">
                      <div className="h-full rounded-full bg-tg-button" style={{ width: `${Math.max(4, item.completed_sets / maxSets * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-tg-hint">Нужны завершённые подходы, чтобы показать распределение нагрузки.</p>
            )}
          </div>

          {advanced && data.weeks.length ? (
            <div className="mt-4">
              <p className="text-xs font-semibold">Объём по неделям</p>
              <div className="mt-2 flex h-24 items-end gap-1 rounded-xl bg-tg-bg p-3" role="img" aria-label="Тоннаж по неделям">
                {data.weeks.map((week) => {
                  const max = Math.max(1, ...data.weeks.map((item) => item.volume_kg));
                  const height = week.volume_kg ? Math.max(6, week.volume_kg / max * 64) : 3;
                  return <div key={week.week_start} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"><span className="w-full max-w-8 rounded-t bg-tg-button" style={{ height }} title={`${formatNumber(week.volume_kg)} кг`} /><span className="text-[9px] text-tg-hint">{week.week_start.slice(8, 10)}.{week.week_start.slice(5, 7)}</span></div>;
                })}
              </div>
              <p className="mt-1 text-[10px] text-tg-hint">Тоннаж — сумма веса × повторения; он не сравнивает разные упражнения по качеству.</p>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
