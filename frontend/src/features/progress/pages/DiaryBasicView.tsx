import { useState } from "react";
import { Link } from "react-router-dom";

import type { DailyMetric } from "@/api/dailyMetrics";
import type { PersonalRegularity } from "@/api/workouts";
import { PlanRegularityCard } from "@/components/PlanRegularityCard";
import { BadgesPanel } from "@/features/progress/pages/BadgesPanel";
import { BodyMeasurementsSummary } from "@/features/progress/pages/BodyMeasurementsSummary";
import { Calendar } from "@/features/progress/pages/Calendar";
import { WeeklyOverview } from "@/features/progress/pages/WeeklyOverview";
import { WellnessSummary } from "@/features/progress/pages/WellnessSummary";
import type { Badge } from "@/utils/achievements";
import type { CalendarDay } from "@/utils/progress";
import type { WeeklyWorkoutOverview } from "@/utils/weeklyOverview";

type Props = {
  regularity: PersonalRegularity | null;
  completedCount: number;
  dailyMetrics: DailyMetric[];
  dailyMetricsError: string | null;
  weekOverview: WeeklyWorkoutOverview;
  onAskWeekAi: () => void;
  weekAiBusy: boolean;
  weekAiError: string | null;
  weekAiText: string | null;
  onClearWeekAi: () => void;
  year: number;
  monthIndex: number;
  calendarDays: CalendarDay[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDate: (date: string) => void;
  badges: Badge[];
};

export function DiaryBasicView(props: Props) {
  const [showBadges, setShowBadges] = useState(false);
  return (
    <div className="grid gap-3 md:grid-cols-2" data-diary-mode="basic">
      <div className="grid grid-cols-2 gap-3 md:col-span-2">
        <PlanRegularityCard summary={props.regularity} valueSize="large" />
        <div className="app-card app-card-base p-4">
          <p className="text-xs text-tg-hint">Завершено</p>
          <p className="mt-1 text-2xl font-semibold">{props.completedCount}</p>
          <p className="mt-1 text-[11px] text-tg-hint">Всего завершённых тренировок</p>
        </div>
      </div>
      <WellnessSummary days={props.dailyMetrics} error={props.dailyMetricsError} />
      <BodyMeasurementsSummary />
      <WeeklyOverview overview={props.weekOverview} onAskAi={props.onAskWeekAi} aiBusy={props.weekAiBusy} />
      {props.weekAiError ? <p role="status" className="rounded-xl bg-tg-secondary px-3 py-2 text-xs text-amber-800">{props.weekAiError}</p> : null}
      {props.weekAiText ? (
        <div className="rounded-2xl bg-tg-secondary p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">ИИ · разбор недели</p>
            <button type="button" className="min-h-11 px-2 text-xs text-tg-hint" onClick={props.onClearWeekAi}>Скрыть</button>
          </div>
          <p className="whitespace-pre-wrap text-sm text-tg-hint">{props.weekAiText}</p>
          <Link to="/ai" className="mt-2 inline-block min-h-11 py-3 text-xs text-tg-link">Открыть чат с тренером →</Link>
        </div>
      ) : null}
      <div className="md:col-span-2">
        <h2 className="mb-2 text-sm font-semibold">Календарь тренировок</h2>
        <Calendar
          year={props.year}
          monthIndex={props.monthIndex}
          days={props.calendarDays}
          onPrev={props.onPrevMonth}
          onNext={props.onNextMonth}
          onSelectDate={props.onSelectDate}
        />
      </div>
      <button
        type="button"
        onClick={() => setShowBadges((value) => !value)}
        aria-expanded={showBadges}
        className="min-h-11 w-full rounded-xl bg-tg-secondary px-4 py-3 text-sm font-medium text-tg-link md:col-span-2"
      >
        {showBadges ? "Скрыть достижения" : "Показать достижения"}
      </button>
      {showBadges ? <div className="md:col-span-2"><BadgesPanel badges={props.badges} /></div> : null}
    </div>
  );
}
