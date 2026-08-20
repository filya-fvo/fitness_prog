import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { DailyMetric } from "@/api/dailyMetrics";

type Props = { days: DailyMetric[]; error?: string | null };
type MetricId = "steps" | "sleep" | "active" | "weight";
type Period = 7 | 14 | 30;
type MetricConfig = {
  label: string;
  shortLabel: string;
  goal: number | null;
  value: (day: DailyMetric) => number | null | undefined;
  format: (value: number) => string;
};

const METRICS: Record<MetricId, MetricConfig> = {
  steps: { label: "Шаги", shortLabel: "Шаги", goal: 8000, value: (day) => day.steps, format: (value) => Math.round(value).toLocaleString("ru-RU") },
  sleep: { label: "Сон", shortLabel: "Сон", goal: 480, value: (day) => day.sleep_minutes, format: (value) => `${Math.floor(value / 60)} ч ${Math.round(value % 60)} мин` },
  active: { label: "Активность", shortLabel: "Активн.", goal: 30, value: (day) => day.active_minutes, format: (value) => `${Math.round(value)} мин` },
  weight: { label: "Вес", shortLabel: "Вес", goal: null, value: (day) => day.weight_kg, format: (value) => `${value.toFixed(1).replace(".", ",")} кг` },
};

function localIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}.${month}`;
}

function buildPeriod(days: DailyMetric[], period: Period): DailyMetric[] {
  const byDate = new Map(days.map((day) => [day.date.slice(0, 10), day]));
  const result: DailyMetric[] = [];
  const end = new Date();
  end.setHours(12, 0, 0, 0);
  for (let offset = period - 1; offset >= 0; offset -= 1) {
    const date = new Date(end);
    date.setDate(end.getDate() - offset);
    const iso = localIso(date);
    result.push(byDate.get(iso) ?? { date: iso, sources: {} });
  }
  return result;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function MetricChart({ series, config }: { series: DailyMetric[]; config: MetricConfig }) {
  const values = series.map((day) => config.value(day));
  const present = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (!present.length) {
    return <div className="flex h-44 items-center justify-center rounded-xl bg-tg-bg text-center text-xs text-tg-hint">Нет данных за выбранный период</div>;
  }

  const goalValues = config.goal == null ? present : [...present, config.goal];
  const rawMin = Math.min(...goalValues);
  const rawMax = Math.max(...goalValues);
  const spread = Math.max(rawMax - rawMin, Math.abs(rawMax) * 0.12, 1);
  const min = config.goal == null ? Math.max(0, rawMin - spread * 0.2) : 0;
  const max = rawMax + spread * 0.15;
  const left = 42;
  const right = 590;
  const top = 14;
  const bottom = 142;
  const x = (index: number) => left + (index / Math.max(1, series.length - 1)) * (right - left);
  const y = (value: number) => bottom - ((value - min) / Math.max(1, max - min)) * (bottom - top);
  const segments: Array<Array<{ x: number; y: number; value: number }>> = [];
  let current: Array<{ x: number; y: number; value: number }> = [];
  values.forEach((value, index) => {
    if (value == null || !Number.isFinite(value)) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push({ x: x(index), y: y(value), value });
    }
  });
  if (current.length) segments.push(current);

  return (
    <div className="rounded-xl bg-tg-bg p-2">
      <svg viewBox="0 0 600 174" className="h-44 w-full" role="img" aria-label={`${config.label} по дням`}>
        <line x1={left} x2={right} y1={bottom} y2={bottom} className="stroke-black/10 dark:stroke-white/15" />
        <line x1={left} x2={right} y1={top} y2={top} className="stroke-black/10 dark:stroke-white/15" />
        <text x="2" y={top + 4} className="fill-tg-hint text-[10px]">{config.format(max)}</text>
        <text x="2" y={bottom + 4} className="fill-tg-hint text-[10px]">{config.format(min)}</text>
        {config.goal != null ? <>
          <line x1={left} x2={right} y1={y(config.goal)} y2={y(config.goal)} strokeDasharray="6 5" className="stroke-emerald-500/70" />
          <text x={right - 2} y={Math.max(12, y(config.goal) - 5)} textAnchor="end" className="fill-emerald-600 text-[10px]">цель {config.format(config.goal)}</text>
        </> : null}
        {segments.map((segment, index) => <g key={index}>
          {segment.length > 1 ? <polyline points={segment.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="stroke-tg-button" /> : null}
          {segment.map((point) => <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="5" className="fill-tg-button"><title>{config.format(point.value)}</title></circle>)}
        </g>)}
        {values.map((value, index) => value == null ? <circle key={`missing-${series[index].date}`} cx={x(index)} cy={bottom} r="2.5" className="fill-black/20 dark:fill-white/20"><title>{shortDate(series[index].date)}: нет данных</title></circle> : null)}
        {[0, Math.floor((series.length - 1) / 2), series.length - 1].map((index) => <text key={index} x={x(index)} y="164" textAnchor={index === 0 ? "start" : index === series.length - 1 ? "end" : "middle"} className="fill-tg-hint text-[10px]">{shortDate(series[index].date)}</text>)}
      </svg>
      <p className="px-1 text-[10px] text-tg-hint">Точки у нижней оси означают дни без данных.</p>
    </div>
  );
}

export function WellnessSummary({ days, error }: Props) {
  const [metric, setMetric] = useState<MetricId>("steps");
  const [period, setPeriod] = useState<Period>(14);
  const series = useMemo(() => buildPeriod(days, period), [days, period]);
  const config = METRICS[metric];
  const values = series.map((day) => ({ date: day.date, value: config.value(day) })).filter((row): row is { date: string; value: number } => row.value != null && Number.isFinite(row.value));
  const avg = average(values.map((row) => row.value));
  const current = values.at(-1)?.value ?? null;
  const change = values.length > 1 ? values.at(-1)!.value - values[0].value : null;

  return (
    <section className="rounded-2xl bg-tg-secondary p-4 md:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="text-sm font-semibold">Активность и восстановление</h2><p className="mt-0.5 text-[11px] text-tg-hint">Один показатель — одна понятная шкала</p></div>
        <div className="flex rounded-full bg-tg-bg p-0.5 text-[11px]" aria-label="Период графика">
          {([7, 14, 30] as const).map((value) => <button key={value} type="button" onClick={() => setPeriod(value)} className={`rounded-full px-2.5 py-1 ${period === value ? "bg-tg-button text-tg-button-text" : "text-tg-hint"}`}>{value} дн.</button>)}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-tg-bg p-1" role="tablist" aria-label="Показатель">
        {(Object.keys(METRICS) as MetricId[]).map((id) => <button key={id} type="button" role="tab" aria-selected={metric === id} onClick={() => setMetric(id)} className={`min-w-0 rounded-lg px-1 py-2 text-[11px] ${metric === id ? "bg-tg-button font-semibold text-tg-button-text" : "text-tg-hint"}`}>{METRICS[id].shortLabel}</button>)}
      </div>
      {error ? <p className="mt-3 rounded-xl bg-tg-bg p-3 text-xs text-tg-hint">{error}</p> : <>
        <div className="my-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl bg-tg-bg p-2.5"><p className="text-[10px] text-tg-hint">Последнее</p><p className="mt-1 text-sm font-semibold tabular-nums">{current == null ? "—" : config.format(current)}</p></div>
          <div className="rounded-xl bg-tg-bg p-2.5"><p className="text-[10px] text-tg-hint">Среднее</p><p className="mt-1 text-sm font-semibold tabular-nums">{avg == null ? "—" : config.format(avg)}</p></div>
          <div className="rounded-xl bg-tg-bg p-2.5"><p className="text-[10px] text-tg-hint">Изменение</p><p className="mt-1 text-sm font-semibold tabular-nums">{change == null ? "—" : `${change > 0 ? "+" : change < 0 ? "−" : ""}${config.format(Math.abs(change))}`}</p></div>
          <div className="rounded-xl bg-tg-bg p-2.5"><p className="text-[10px] text-tg-hint">Заполнено</p><p className="mt-1 text-sm font-semibold tabular-nums">{values.length} из {period}</p></div>
        </div>
        <MetricChart series={series} config={config} />
      </>}
      <Link to="/" className="mt-3 block text-center text-xs text-tg-link">Внести сон, шаги, активность или вес →</Link>
    </section>
  );
}
