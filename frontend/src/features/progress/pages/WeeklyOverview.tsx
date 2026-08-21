import { Link } from "react-router-dom";

import { formatWeekDelta, type WeeklyWorkoutOverview } from "@/utils/weeklyOverview";
import { daysCount, setsCount, workoutsCount } from "@/utils/localization";

type Props = {
  overview: WeeklyWorkoutOverview;
  onAskAi?: () => void;
  aiBusy?: boolean;
};

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
          <p className="text-[10px] text-tg-hint">{workoutsCount(overview.completedWorkouts).replace(/^\d+\s/, "")}</p>
          <p className="text-[10px] text-tg-hint">
            {formatWeekDelta(overview.vsPrevWeek.workoutsDelta, "workouts")}
          </p>
        </div>
        <div className="rounded-xl bg-tg-bg px-2 py-2">
          <p className="text-lg font-semibold">{overview.activeDays}</p>
          <p className="text-[10px] text-tg-hint">{daysCount(overview.activeDays).replace(/^\d+\s/, "")} активности</p>
          <p className="text-[10px] text-tg-hint">{setsCount(overview.totalSets)}</p>
        </div>
        <div className="rounded-xl bg-tg-bg px-2 py-2">
          <p className="text-lg font-semibold">
            {overview.totalVolume >= 1000
              ? `${(overview.totalVolume / 1000).toFixed(1)}т`
              : overview.totalVolume}
          </p>
          <p className="text-[10px] text-tg-hint">объём, кг</p>
          <p className="text-[10px] text-tg-hint">
            {formatWeekDelta(overview.vsPrevWeek.volumeDelta, "volume")}
          </p>
        </div>
      </div>

      <div className="relative mb-2 flex items-end justify-between gap-1 pt-4">
        <span className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-white/10" />
        {overview.days.map((d) => {
          const h = d.volume > 0 ? Math.max(8, Math.round((d.volume / maxVol) * 40)) : 4;
          return (
            <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="relative flex h-11 w-full items-end justify-center" role="img" aria-label={`${d.date}: ${d.completed} тренировок, объём ${Math.round(d.volume)} килограммов`}>
                {d.completed > 0 ? <span className="absolute -top-3 text-[9px] font-semibold text-tg-text">{d.completed}</span> : null}
                <span
                className={[
                  "w-full max-w-[28px] rounded-t-md",
                  d.completed > 0 ? "bg-gradient-to-t from-blue-600/80 to-cyan-400/90" : "bg-white/10",
                  d.isToday ? "ring-2 ring-tg-link/40" : "",
                ].join(" ")}
                style={{ height: h }}
                title={`${d.date}: ${d.completed} тр., ${Math.round(d.volume)} кг`}
                />
              </div>
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
        <p className="mb-2 text-[11px] text-tg-hint">
          Средняя субъективная тяжесть недели: {overview.avgRpe}/10 (RPE)
        </p>
      ) : null}

      <p className="text-xs text-tg-hint">{overview.tip}</p>

      {onAskAi ? (
        <button
          type="button"
          disabled={aiBusy}
          onClick={onAskAi}
          className="mt-3 w-full rounded-xl bg-tg-bg px-3 py-2.5 text-xs font-medium text-tg-link disabled:opacity-60"
        >
          {aiBusy ? "ИИ анализирует…" : "ИИ-разбор этой недели"}
        </button>
      ) : null}
    </div>
  );
}
