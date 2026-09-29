import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";

import { DiarySnapshotCards } from "./DiarySnapshotCards";

it("shows real diary values and leaves missing measurements empty", () => {
  const markup = renderToStaticMarkup(<MemoryRouter><DiarySnapshotCards
    regularity={{ period_start: "2026-09-01", period_end: "2026-09-28", has_schedule: true, completed: 3, planned: 4, rescheduled_completed: 0, cancelled: 0, paused: 0, missed: 1, completion_pct: 75 }}
    week={{ weekStart: "2026-09-28", weekEnd: "2026-10-04", rangeLabel: "", completedWorkouts: 1, activeDays: 1, totalVolume: 0, totalSets: 0, avgRpe: null, vsPrevWeek: { workoutsDelta: 0, volumeDelta: 0, prevWorkouts: 0, prevVolume: 0 }, tip: "", days: ["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map((weekdayShort, index) => ({ date: `2026-09-${28 + index}`, weekdayShort, isToday: index === 1, completed: index === 0 ? 1 : 0, volume: 0 })) }}
    dailyMetrics={[]}
    measurements={null}
    measurementMonths={3}
    goal="maintain"
    guidance={{ dataLabel: "Пока мало данных", dataDescription: "", comparisonLabel: "", comparison: "1 тренировка за период", action: "Открыть тренировку", actionHref: "/" }}
  /></MemoryRouter>);
  expect(markup).toContain("75%");
  expect(markup).toContain("3 из 4");
  expect(markup).toContain("Нет данных");
  expect(markup).toContain("Добавьте замер");
  expect(markup).toContain("Поддержание формы");
  expect(markup).toContain('href="/"');
});
