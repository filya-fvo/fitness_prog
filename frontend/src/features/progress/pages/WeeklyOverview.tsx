import { Link } from "react-router-dom";

import type { WeeklyWorkoutOverview } from "@/utils/weeklyOverview";

type Props = {
  overview: WeeklyWorkoutOverview;
  onAskAi?: () => void;
  aiBusy?: boolean;
};

function deltaLabel(n: number, unit = ""): string {
  if (n === 0) return `= прошл.${unit ? ` ${unit}` : ""}`;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}${unit}`;
}

export function WeeklyOverview({ overview, onAskAi, aiBusy }: Props) {
  const maxVol = Math.max(1, ...overview.days.map((d) => d.volume));

  return (
    <div className="rounded-2xl bg-tg-secondary p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Недельный обзор</p>
          <p className="text-[11px] text-tg-hint">{overview.rangeLabel} · пн–вс</p>
        </div>
        <Link to="/" className="shrink-0 text-[11px] text-tg-link">
          К тренировке
        </Link>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-tg-bg px-2 py-2">
          <p className="text-lg font-semibold">{overview.completedWorkouts}</p>
          <p className="text-[10px] text-tg-hint">тренировок</p>
          <p className="text-[10px] text-tg-hint">
            {deltaLabel(overview.vsPrevWeek.workoutsDelta)}
          </p>
        </div>
        <div className="rounded-xl bg-tg-bg px-2 py-2">
          <p className="text-lg font-semibold">{overview.activeDays}</p>
          <p className="text-[10px] text-tg-hint">активных дней</p>
          <p className="text-[10px] text-tg-hint">{overview.totalSets} подх.</p>
        </div>
        <div className="rounded-xl bg-tg-bg px-2 py-2">
          <p className="text-lg font-semibold">
            {overview.totalVolume >= 1000
              ? `${(overview.totalVolume / 1000).toFixed(1)}т`
              : overview.totalVolume}
          </p>
          <p className="text-[10px] text-tg-hint">тоннаж, кг</p>
          <p className="text-[10px] text-tg-hint">
            {deltaLabel(overview.vsPrevWeek.volumeDelta, " кг")}
          </p>
        </div>
      </div>

      <div className="mb-2 flex items-end justify-between gap-1">
        {overview.days.map((d) => {
          const h = d.volume > 0 ? Math.max(8, Math.round((d.volume / maxVol) * 40)) : 4;
          return (
            <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div
                className={[
                  "w-full max-w-[28px] rounded-t-md",
                  d.completed > 0 ? "bg-tg-button" : "bg-black/10",
                  d.isToday ? "ring-2 ring-tg-link/40" : "",
                ].join(" ")}
                style={{ height: h }}
                title={`${d.date}: ${d.completed} тр., ${Math.round(d.volume)} кг`}
              />
              <span
                className={[
                  "text-[10px]",
                  d.isToday ? "font-semibold text-tg-text" : "text-tg-hint",
                ].join(" ")}
              >
                {d.weekdayShort}
              </span>
            </div>
          );
        })}
      </div>

      {overview.avgRpe != null ? (
        <p className="mb-2 text-[11px] text-tg-hint">Средний RPE недели: {overview.avgRpe}</p>
      ) : null}

      <p className="text-xs text-tg-hint">{overview.tip}</p>

      {onAskAi ? (
        <button
          type="button"
          disabled={aiBusy}
          onClick={onAskAi}
          className="mt-3 w-full rounded-xl bg-tg-bg px-3 py-2.5 text-xs font-medium text-tg-link disabled:opacity-60"
        >
          {aiBusy ? "AI думает…" : "AI: разбор этой недели"}
        </button>
      ) : null}
    </div>
  );
}
