import { Link } from "react-router-dom";

import type { DashboardGuidance, AnalyticsDepth } from "@/utils/personalDashboard";
import { GOAL_DASHBOARD, LEVEL_LABELS } from "@/utils/personalDashboard";

type Props = {
  goal: string;
  level: string;
  depth: AnalyticsDepth;
  guidance: DashboardGuidance;
  saving: boolean;
  error: string | null;
  onExpandedChange: (expanded: boolean) => void;
};

export function PersonalDashboardCard({
  goal,
  level,
  depth,
  guidance,
  saving,
  error,
  onExpandedChange,
}: Props) {
  const config = GOAL_DASHBOARD[goal] ?? GOAL_DASHBOARD.maintain;
  const expanded = depth === "advanced";
  return (
    <section className="mb-3 rounded-2xl border border-tg-link/20 bg-tg-secondary p-4" aria-labelledby="personal-dashboard-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-tg-link">Ваш дашборд</p>
          <h1 id="personal-dashboard-title" className="mt-1 text-lg font-semibold">{config.label}</h1>
          <p className="mt-1 text-xs text-tg-hint">{config.description}</p>
        </div>
        <span className="rounded-full bg-tg-bg px-2.5 py-1 text-[11px] text-tg-hint">
          {LEVEL_LABELS[level] ?? "Уровень не указан"}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-tg-bg p-3">
          <p className="text-xs font-semibold">{guidance.dataLabel}</p>
          <p className="mt-1 text-[11px] text-tg-hint">{guidance.dataDescription}</p>
        </div>
        <div className="rounded-xl bg-tg-bg p-3">
          <p className="text-xs font-semibold">{guidance.comparisonLabel}</p>
          <p className="mt-1 text-[11px] text-tg-hint">{guidance.comparison}</p>
        </div>
      </div>

      <Link
        to={guidance.actionHref}
        className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-tg-button px-4 py-2 text-center text-sm font-semibold text-tg-button-text"
      >
        {guidance.action}
      </Link>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-black/10 pt-3 dark:border-white/10">
        <div>
          <p className="text-xs font-medium">Глубина аналитики</p>
          <p className="mt-0.5 text-[10px] text-tg-hint">
            {level === "advanced" ? "Расширенный режим выбран по анкете" : "Можно открыть сложные показатели вручную"}
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-2 rounded-xl bg-tg-bg p-1 text-[11px]" aria-label="Глубина аналитики">
          <button
            type="button"
            aria-pressed={!expanded}
            disabled={saving}
            onClick={() => onExpandedChange(false)}
            className={`min-h-11 rounded-lg px-3 ${!expanded ? "bg-tg-button font-semibold text-tg-button-text" : "text-tg-hint"}`}
          >
            Основное
          </button>
          <button
            type="button"
            aria-pressed={expanded}
            disabled={saving}
            onClick={() => onExpandedChange(true)}
            className={`min-h-11 rounded-lg px-3 ${expanded ? "bg-tg-button font-semibold text-tg-button-text" : "text-tg-hint"}`}
          >
            Расширенно
          </button>
        </div>
      </div>
      {error ? <p role="status" className="mt-2 text-xs text-amber-500">{error}</p> : null}
    </section>
  );
}
