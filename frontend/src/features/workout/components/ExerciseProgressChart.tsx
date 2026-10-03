import { useEffect, useMemo, useState } from "react";

import type { ExerciseProgressPoint, ExerciseWeekPhase } from "@/types/workout";
import { filterExerciseProgress } from "@/utils/exerciseProgress";

type Period = 7 | 30 | 365;
type Phase = "all" | Exclude<ExerciseWeekPhase, "unknown">;
type Metric = "totalWeight" | "estimated1rm";

const PHASES: Array<{ id: Phase; label: string }> = [
  { id: "all", label: "Все" },
  { id: "light", label: "Лёгкая" },
  { id: "medium", label: "Средняя" },
  { id: "heavy", label: "Тяжёлая" },
];

function shortDate(value: string): string {
  return value.slice(5).split("-").reverse().join(".");
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
    .format(new Date(`${value}T12:00:00`));
}

function displayWeight(point: ExerciseProgressPoint): string {
  if (point.weightMode === "per_hand") {
    return `${point.weight} кг/руку · ${point.totalWeight} кг всего`;
  }
  return `${point.totalWeight} кг`;
}

function LineChart({ points, metric }: { points: ExerciseProgressPoint[]; metric: Metric }) {
  const values = points.map((point) => point[metric]);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = Math.max((rawMax - rawMin) * 0.18, rawMax * 0.04, 1);
  const min = Math.max(0, rawMin - padding);
  const max = rawMax + padding;
  const left = 50;
  const right = 582;
  const top = 25;
  const bottom = 178;
  const x = (index: number) => left + (index / Math.max(1, points.length - 1)) * (right - left);
  const y = (value: number) => bottom - ((value - min) / Math.max(1, max - min)) * (bottom - top);
  const coords = points.map((point, index) => ({ x: x(index), y: y(point[metric]), point }));
  const polyline = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${left},${bottom} ${polyline} ${right},${bottom}`;

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-tg-bg p-2">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
        <div className="flex h-52 flex-col justify-between py-6 text-xs text-tg-hint"><span>{Math.round(max)} кг</span><span>{Math.round(min)} кг</span></div>
        <svg viewBox="45 0 550 200" preserveAspectRatio="none" className="h-52 w-full" role="img" aria-label="Динамика рабочих весов упражнения">
          <defs>
            <linearGradient id="exercise-progress-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--app-accent)" stopOpacity="0.34" />
              <stop offset="1" stopColor="var(--app-violet)" stopOpacity="0.03" />
            </linearGradient>
          </defs>
          {[top, (top + bottom) / 2, bottom].map((gridY) => (
            <line key={gridY} x1={left} x2={right} y1={gridY} y2={gridY} stroke="currentColor" opacity="0.12" strokeDasharray="4 5" />
          ))}
          {points.length > 1 ? <polygon points={area} fill="url(#exercise-progress-area)" /> : null}
          {points.length > 1 ? <polyline points={polyline} fill="none" stroke="var(--app-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {coords.map(({ x: pointX, y: pointY, point }, index) => <circle key={`${point.date}-${index}`} cx={pointX} cy={pointY} r="4.5" fill="var(--app-accent)" stroke="var(--app-bg)" strokeWidth="2">
            <title>{shortDate(point.date)}: {point[metric]} кг · {displayWeight(point)} × {point.reps}</title>
          </circle>)}
        </svg>
      </div>
      <div className="mt-1 flex justify-between gap-2 text-xs text-tg-hint">{[0, Math.floor((points.length - 1) / 2), points.length - 1].filter((index, position, all) => all.indexOf(index) === position).map((index) => <span key={index}>{shortDate(points[index].date)}</span>)}</div>
    </div>
  );
}

export function ExerciseProgressChart({ allPoints }: { allPoints: ExerciseProgressPoint[] }) {
  const [period, setPeriod] = useState<Period>(30);
  const [phase, setPhase] = useState<Phase>("all");
  const [metric, setMetric] = useState<Metric>("totalWeight");
  const [visibleRows, setVisibleRows] = useState(12);
  const points = useMemo(() => filterExerciseProgress(allPoints, period, phase), [allPoints, period, phase]);
  const first = points[0] ?? null;
  const latest = points.at(-1) ?? null;
  const best = points.length ? Math.max(...points.map((point) => point[metric])) : null;
  const delta = points.length > 1 && first && latest ? Math.round((latest[metric] - first[metric]) * 10) / 10 : null;
  const tablePoints = points.slice(-visibleRows).reverse();

  useEffect(() => setVisibleRows(12), [period, phase]);

  return (
    <div>
      <div className="flex rounded-xl bg-tg-bg p-1 text-xs" aria-label="Период истории упражнения">
        {([[7, "Неделя"], [30, "Месяц"], [365, "Год"]] as const).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)} className={`min-h-11 flex-1 rounded-lg px-2 py-2 ${period === value ? "app-gradient-action font-semibold text-white" : "text-tg-hint"}`}>{label}</button>
        ))}
      </div>
      <div className="mt-2 flex gap-1 overflow-x-auto pb-1" aria-label="Фаза недели">
        {PHASES.map((item) => <button key={item.id} type="button" aria-pressed={phase === item.id} onClick={() => setPhase(item.id)} className={`min-h-11 shrink-0 rounded-full px-3 py-2 text-xs ${phase === item.id ? "bg-tg-button/15 font-semibold text-tg-link" : "bg-tg-bg text-tg-hint"}`}>{item.label}</button>)}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-tg-hint">Лучший завершённый подход за тренировку</p>
        <div className="flex rounded-full bg-tg-bg p-0.5 text-xs">
          <button type="button" aria-pressed={metric === "totalWeight"} onClick={() => setMetric("totalWeight")} className={`min-h-11 rounded-full px-3 py-1 ${metric === "totalWeight" ? "app-gradient-action text-white" : "text-tg-hint"}`}>Вес</button>
          <button type="button" aria-pressed={metric === "estimated1rm"} onClick={() => setMetric("estimated1rm")} className={`min-h-11 rounded-full px-3 py-1 ${metric === "estimated1rm" ? "app-gradient-action text-white" : "text-tg-hint"}`}>1ПМ</button>
        </div>
      </div>
      {!points.length ? <div className="mt-3 rounded-xl bg-tg-bg p-4 text-center text-xs text-tg-hint">Нет завершённых подходов с весом за выбранный период и тип недели.</div> : null}
      {points.length ? <>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-tg-bg p-2"><p className="text-xs text-tg-hint">Последнее</p><p className="mt-1 text-sm font-semibold tabular-nums">{latest?.[metric]} кг</p></div>
          <div className="rounded-xl bg-tg-bg p-2"><p className="text-xs text-tg-hint">Лучшее</p><p className="mt-1 text-sm font-semibold tabular-nums">{best} кг</p></div>
          <div className="rounded-xl bg-tg-bg p-2"><p className="text-xs text-tg-hint">Изменение</p><p className={`mt-1 text-sm font-semibold tabular-nums ${delta != null && delta > 0 ? "text-emerald-400" : ""}`}>{delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta} кг`}</p></div>
        </div>
        <LineChart points={points} metric={metric} />
        {points.length === 1 ? <p className="mt-2 text-xs text-tg-hint">Пока есть один результат. Линия появится после следующей тренировки.</p> : null}
        {metric === "estimated1rm" ? <p className="mt-2 text-xs text-tg-hint">1ПМ — расчёт по формуле Эпли, а не рекомендация проверять максимальный вес.</p> : null}
        <div role="region" aria-label="Таблица динамики упражнения" tabIndex={0} className="mt-4 overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="w-full min-w-[420px] border-collapse text-left text-xs">
            <caption className="sr-only">Табличные данные динамики упражнения</caption>
            <thead className="bg-tg-bg text-tg-hint">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Дата</th>
                <th scope="col" className="px-3 py-2 font-medium">Неделя</th>
                <th scope="col" className="px-3 py-2 font-medium">Вес</th>
                <th scope="col" className="px-3 py-2 font-medium">Повторы</th>
                <th scope="col" className="px-3 py-2 font-medium">1ПМ</th>
              </tr>
            </thead>
            <tbody>
              {tablePoints.map((point) => (
                <tr key={point.date} className="border-t border-[var(--border-subtle)]">
                  <td className="whitespace-nowrap px-3 py-2.5">{displayDate(point.date)}</td>
                  <td className="px-3 py-2.5">{PHASES.find((item) => item.id === point.phase)?.label ?? "Без фазы"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{displayWeight(point)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{point.reps}</td>
                  <td className="px-3 py-2.5 tabular-nums">{point.estimated1rm} кг</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visibleRows < points.length ? (
          <button
            type="button"
            onClick={() => setVisibleRows((current) => Math.min(points.length, current + 25))}
            className="mt-2 min-h-11 w-full rounded-xl bg-tg-bg px-3 py-2 text-xs font-medium text-tg-link"
          >
            Показать ещё ({points.length - visibleRows})
          </button>
        ) : null}
      </> : null}
    </div>
  );
}
