import { useMemo, useState } from "react";

import type { ExerciseProgressPoint, ExerciseWeekPhase } from "@/utils/exerciseProgress";
import { filterExerciseProgress } from "@/utils/exerciseProgress";

type Period = 7 | 30 | 365;
type Phase = "all" | Exclude<ExerciseWeekPhase, "unknown">;
type Metric = "weight" | "estimated1rm";

const PHASES: Array<{ id: Phase; label: string }> = [
  { id: "all", label: "Все" },
  { id: "light", label: "Лёгкая" },
  { id: "medium", label: "Средняя" },
  { id: "heavy", label: "Тяжёлая" },
];

function shortDate(value: string): string {
  return value.slice(5).split("-").reverse().join(".");
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
  const labelStep = Math.max(1, Math.ceil(points.length / 7));

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-white/5 bg-tg-bg p-2">
      <svg viewBox="0 0 600 220" className="h-52 w-full" role="img" aria-label="Динамика рабочих весов упражнения">
        <defs>
          <linearGradient id="exercise-progress-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--app-accent)" stopOpacity="0.34" />
            <stop offset="1" stopColor="var(--app-violet)" stopOpacity="0.03" />
          </linearGradient>
        </defs>
        {[top, (top + bottom) / 2, bottom].map((gridY) => (
          <line key={gridY} x1={left} x2={right} y1={gridY} y2={gridY} stroke="currentColor" opacity="0.12" strokeDasharray="4 5" />
        ))}
        <text x="4" y={top + 4} className="fill-tg-hint text-[10px]">{Math.round(max)} кг</text>
        <text x="4" y={bottom + 4} className="fill-tg-hint text-[10px]">{Math.round(min)} кг</text>
        <polygon points={area} fill="url(#exercise-progress-area)" />
        {points.length > 1 ? <polyline points={polyline} fill="none" stroke="var(--app-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {coords.map(({ x: pointX, y: pointY, point }, index) => {
          const showLabel = index % labelStep === 0 || index === coords.length - 1;
          return <g key={`${point.date}-${index}`}>
            <circle cx={pointX} cy={pointY} r="4.5" fill="var(--app-accent)" stroke="var(--app-bg)" strokeWidth="2">
              <title>{shortDate(point.date)}: {point[metric]} кг · {point.weight} кг × {point.reps}</title>
            </circle>
            {showLabel ? <text x={pointX} y={Math.max(13, pointY - 9)} textAnchor="middle" className="fill-tg-text text-[10px] font-semibold">{point[metric]}</text> : null}
          </g>;
        })}
        {[0, Math.floor((points.length - 1) / 2), points.length - 1].filter((value, index, all) => all.indexOf(value) === index).map((index) => (
          <text key={index} x={x(index)} y="207" textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"} className="fill-tg-hint text-[10px]">{shortDate(points[index].date)}</text>
        ))}
      </svg>
    </div>
  );
}

export function ExerciseProgressChart({ allPoints }: { allPoints: ExerciseProgressPoint[] }) {
  const [period, setPeriod] = useState<Period>(30);
  const [phase, setPhase] = useState<Phase>("all");
  const [metric, setMetric] = useState<Metric>("weight");
  const points = useMemo(() => filterExerciseProgress(allPoints, period, phase), [allPoints, period, phase]);
  const first = points[0] ?? null;
  const latest = points.at(-1) ?? null;
  const best = points.length ? Math.max(...points.map((point) => point[metric])) : null;
  const delta = first && latest ? Math.round((latest[metric] - first[metric]) * 10) / 10 : null;

  return (
    <div>
      <div className="flex rounded-xl bg-tg-bg p-1 text-xs" aria-label="Период истории упражнения">
        {([[7, "Неделя"], [30, "Месяц"], [365, "Год"]] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setPeriod(value)} className={`flex-1 rounded-lg px-2 py-2 ${period === value ? "bg-tg-button font-semibold text-tg-button-text" : "text-tg-hint"}`}>{label}</button>
        ))}
      </div>
      <div className="mt-2 flex gap-1 overflow-x-auto pb-1" aria-label="Фаза недели">
        {PHASES.map((item) => <button key={item.id} type="button" onClick={() => setPhase(item.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] ${phase === item.id ? "bg-tg-button/20 font-semibold text-tg-link" : "bg-tg-bg text-tg-hint"}`}>{item.label}</button>)}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-tg-hint">Лучший завершённый подход за тренировку</p>
        <div className="flex rounded-full bg-tg-bg p-0.5 text-[11px]">
          <button type="button" onClick={() => setMetric("weight")} className={`rounded-full px-2 py-1 ${metric === "weight" ? "bg-tg-button text-tg-button-text" : "text-tg-hint"}`}>Вес</button>
          <button type="button" onClick={() => setMetric("estimated1rm")} className={`rounded-full px-2 py-1 ${metric === "estimated1rm" ? "bg-tg-button text-tg-button-text" : "text-tg-hint"}`}>1ПМ</button>
        </div>
      </div>
      {!points.length ? <div className="mt-3 rounded-xl bg-tg-bg p-4 text-center text-xs text-tg-hint">Нет завершённых подходов с весом за выбранный период и тип недели.</div> : null}
      {points.length ? <>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-tg-bg p-2"><p className="text-[10px] text-tg-hint">Последнее</p><p className="mt-1 text-sm font-semibold tabular-nums">{latest?.[metric]} кг</p></div>
          <div className="rounded-xl bg-tg-bg p-2"><p className="text-[10px] text-tg-hint">Лучшее</p><p className="mt-1 text-sm font-semibold tabular-nums">{best} кг</p></div>
          <div className="rounded-xl bg-tg-bg p-2"><p className="text-[10px] text-tg-hint">Изменение</p><p className={`mt-1 text-sm font-semibold tabular-nums ${delta != null && delta > 0 ? "text-emerald-400" : ""}`}>{delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta} кг`}</p></div>
        </div>
        <LineChart points={points} metric={metric} />
        {metric === "estimated1rm" ? <p className="mt-2 text-[11px] text-tg-hint">1ПМ — расчёт по формуле Эпли, а не рекомендация проверять максимальный вес.</p> : null}
      </> : null}
    </div>
  );
}
