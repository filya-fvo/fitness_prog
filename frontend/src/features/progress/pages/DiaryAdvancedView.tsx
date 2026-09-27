import type { ProgressDashboard, ProgressDashboardPeriod } from "@/api/progressDashboard";
import type { StrengthTrendSets } from "@/api/strengthTrends";
import type { DailyMetric } from "@/api/dailyMetrics";
import { StatusNotice } from "@/components/ui/StatusNotice";
import { Charts } from "@/features/progress/pages/Charts";
import { NutritionSummaryCard } from "@/features/progress/pages/NutritionSummaryCard";
import { StrengthTrendSetsCard } from "@/features/progress/pages/StrengthTrendSets";
import { TrainingLoadAnalytics } from "@/features/progress/pages/TrainingLoadAnalytics";
import { RecoveryLoadComparison } from "@/features/progress/pages/RecoveryLoadComparison";
import type { DayVolume, NutritionBalanceDay, NutritionPeriodTotals } from "@/utils/progress";

type NutritionRangeMode = "day" | "week";

type Props = {
  dashboard: ProgressDashboard | null;
  dashboardLoading: boolean;
  dashboardError: string | null;
  onPeriodChange: (period: ProgressDashboardPeriod) => void;
  strengthTrendSets: StrengthTrendSets | null;
  strengthTrendsError: string | null;
  nutritionMode: NutritionRangeMode;
  onNutritionModeChange: (mode: NutritionRangeMode) => void;
  nutritionError: string | null;
  nutritionSeries: NutritionBalanceDay[];
  nutritionTarget: number | null;
  nutritionPeriods: { day: NutritionPeriodTotals; week: NutritionPeriodTotals; month: NutritionPeriodTotals } | null;
  volumeSeries: DayVolume[];
  dailyMetrics: DailyMetric[];
  dailyMetricsError: string | null;
};

export function DiaryAdvancedView(props: Props) {
  return (
    <div className="grid gap-3 md:grid-cols-2" data-diary-mode="advanced">
      <TrainingLoadAnalytics
        data={props.dashboard}
        loading={props.dashboardLoading}
        error={props.dashboardError}
        advanced
        onPeriodChange={props.onPeriodChange}
      />
      <StrengthTrendSetsCard data={props.strengthTrendSets} error={props.strengthTrendsError} simple={false} />
      <NutritionSummaryCard
        mode={props.nutritionMode}
        onModeChange={props.onNutritionModeChange}
        error={props.nutritionError}
        series={props.nutritionSeries}
        dailyTarget={props.nutritionTarget}
        periods={props.nutritionPeriods}
      />
      <RecoveryLoadComparison dashboard={props.dashboard} days={props.dailyMetrics} error={props.dashboardError || props.dailyMetricsError} />
      <div className="md:col-span-2">
        {props.volumeSeries.some((day) => day.workouts > 0)
          ? <Charts series={props.volumeSeries} />
          : <StatusNotice>Нужна завершённая тренировка для графика объёма.</StatusNotice>}
      </div>
    </div>
  );
}
