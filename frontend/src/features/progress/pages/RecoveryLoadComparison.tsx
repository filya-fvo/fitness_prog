import type { DailyMetric } from "@/api/dailyMetrics";
import type { ProgressDashboard } from "@/api/progressDashboard";
import { StatusNotice } from "@/components/ui/StatusNotice";
import { pairWeeklyLoadAndSleep } from "@/utils/recoveryLoad";

export function RecoveryLoadComparison({ dashboard, days, error }: {
  dashboard: ProgressDashboard | null;
  days: DailyMetric[];
  error: string | null;
}) {
  const rows = dashboard ? pairWeeklyLoadAndSleep(dashboard.weeks, days).filter((row) => row.sleepMinutes != null) : [];
  return (
    <section className="app-card app-card-neutral p-4 md:col-span-2" aria-labelledby="recovery-load-title">
      <h2 id="recovery-load-title" className="text-sm font-semibold">Нагрузка и сон по неделям</h2>
      <p className="mt-1 text-xs text-tg-hint">Сравнение только по неделям с записью сна. Это не оценка причины изменений.</p>
      {error ? <StatusNotice role="status" tone="danger" className="mt-3">{error}</StatusNotice> : null}
      {!error && !dashboard ? <StatusNotice role="status" className="mt-3">Загружаем данные для сравнения…</StatusNotice> : null}
      {!error && dashboard && !rows.length ? <StatusNotice className="mt-3">Добавьте сон в дневной чек-ин, чтобы сравнить его с нагрузкой.</StatusNotice> : null}
      {rows.length ? (
        <div className="mt-3">
          <div className="grid grid-cols-[4rem_1fr_1fr] gap-2 px-3 text-[11px] text-tg-hint" aria-hidden="true">
            <span>Неделя</span><span>Объём</span><span>Средний сон</span>
          </div>
          <ul className="mt-1 space-y-2">
          {rows.map((row) => (
            <li key={row.weekStart} className="grid grid-cols-[4rem_1fr_1fr] items-center gap-2 app-metric p-3 text-xs">
              <span className="text-tg-hint">с {row.weekStart.slice(8)}.{row.weekStart.slice(5, 7)}</span>
              <span><span className="sr-only">Объём: </span>{Math.round(row.volumeKg).toLocaleString("ru-RU")} кг</span>
              <span><span className="sr-only">Средний сон: </span>{Math.floor(row.sleepMinutes! / 60)} ч {row.sleepMinutes! % 60} мин</span>
            </li>
          ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
