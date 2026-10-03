import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { DiaryAdvancedView } from "@/features/progress/pages/DiaryAdvancedView";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <DiaryAdvancedView dashboard={null} dashboardLoading={false} dashboardError={null}
      onPeriodChange={() => undefined} strengthTrendSets={{ nextWorkout: null, bestImprovements: [], pinned: [] }}
      strengthTrendsError={null} nutritionMode="day" onNutritionModeChange={() => undefined}
      nutritionError={null} nutritionSeries={[]} nutritionTarget={null} nutritionPeriods={null}
      volumeSeries={[]} dailyMetrics={[]} dailyMetricsError={null} />
  </MemoryRouter>,
);
