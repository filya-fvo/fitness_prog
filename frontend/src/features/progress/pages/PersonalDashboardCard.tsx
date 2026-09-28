import { Link } from "react-router-dom";

import { DiaryModeTabs } from "@/features/progress/components/DiaryModeTabs";
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
    <section className="app-card app-card-indigo mb-3 p-4" aria-labelledby="personal-dashboard-title">
      <DiaryModeTabs expanded={expanded} saving={saving} level={level} onChange={onExpandedChange} />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-tg-link">Мой прогресс</p>
          <h1 id="personal-dashboard-title" className="mt-1 text-lg font-semibold">{config.label}</h1>
          <p className="mt-1 text-xs text-tg-hint">{config.description}</p>
        </div>
        <span className="app-chip px-2.5 py-1 text-[11px]">
          {LEVEL_LABELS[level] ?? "Уровень не указан"}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="app-card-inset border border-[var(--border-subtle)] p-3">
          <p className="text-xs font-semibold">{guidance.dataLabel}</p>
          <p className="mt-1 text-[11px] text-tg-hint">{guidance.dataDescription}</p>
        </div>
        <div className="app-card-inset border border-[var(--border-subtle)] p-3">
          <p className="text-xs font-semibold">{guidance.comparisonLabel}</p>
          <p className="mt-1 text-[11px] text-tg-hint">{guidance.comparison}</p>
        </div>
      </div>

      <Link
        to={guidance.actionHref}
        className="app-gradient-action mt-3 flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-center text-sm font-semibold"
      >
        {guidance.action}
      </Link>

      {error ? <p role="status" className="mt-2 text-xs text-amber-500">{error}</p> : null}
    </section>
  );
}
