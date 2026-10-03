import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { DiaryBasicView } from "@/features/progress/pages/DiaryBasicView";
import { ExerciseMediaPlayer } from "@/features/workout/components/ExerciseMediaPlayer";
import { ExerciseMediaTabs } from "@/features/workout/components/ExerciseMediaTabs";
import { StrengthTrendSetsCard } from "@/features/progress/pages/StrengthTrendSets";
import { ExerciseProgressSection } from "@/features/workout/components/ExerciseProgressSection";
import { useUserStore } from "@/store/userStore";
import type { Exercise } from "@/types/workout";
import "@/index.css";
import { initializeTheme } from "@/theme/theme";
import { FaqArticleCard } from "@/features/help/FaqArticleCard";
import { FAQ_ARTICLES } from "@/features/help/faqContent";

initializeTheme();

const exercise: Exercise = {
  id: "44444444-4444-4444-8444-444444444444", name_ru: "Присед", muscle_group: "ноги",
  equipment: "свой вес", description: null, technique: "Техника", common_mistakes: null,
  difficulty: 1, video_url: null, animation_url: "/audit-motion.gif", image_url: "/audit-still.png",
  thumbnail_url: "/audit-still.png", media_duration_sec: null, media_source: "local", tags: [],
};
const overview = {
  weekStart: "2026-09-28", weekEnd: "2026-10-04", rangeLabel: "Неделя",
  days: [], completedWorkouts: 0, activeDays: 0, totalVolume: 0, totalSets: 0, avgRpe: null,
  vsPrevWeek: { workoutsDelta: 0, volumeDelta: 0, prevWorkouts: 0, prevVolume: 0 }, tip: "",
};
const guidance = { dataLabel: "", dataDescription: "", comparisonLabel: "", comparison: "", action: "", actionHref: "/" };
const longReply = "Рекомендация для недели. ".repeat(60) + "КОНЕЦ ПЕРВОГО ОТЧЁТА";
useUserStore.setState({ user: { id: "11111111-1111-4111-8111-111111111111", subscription_status: "plus", onboarding_completed: true } });
function Fixture() {
  const [text, setText] = useState(longReply);
  const mode = new URLSearchParams(location.search).get("mode");
  if (mode === "faq") return <FaqArticleCard article={FAQ_ARTICLES[0]} highlighted />;
  if (mode === "progress") return <ExerciseProgressSection exerciseId={exercise.id} exerciseName={exercise.name_ru} />;
  if (mode === "motion") return <ExerciseMediaPlayer exercise={exercise} mediaOnly preferAnimation />;
  if (mode === "tabs") return <>
    <StrengthTrendSetsCard data={{ nextWorkout: null, bestImprovements: [], pinned: [] }} error={null} />
    <ExerciseMediaTabs exercise={exercise} />
  </>;
  return <>
    <button onClick={() => setText("Новый недельный отчёт. ".repeat(60) + "КОНЕЦ НОВОГО ОТЧЁТА")}>Другой отчёт</button>
    <DiaryBasicView regularity={null} goal="" guidance={guidance} completedCount={0} dailyMetrics={[]}
      dailyMetricsError={null} weekOverview={overview} onAskWeekAi={() => undefined} weekAiBusy={false}
      weekAiError={null} weekAiText={text} onClearWeekAi={() => setText("")} year={2026} monthIndex={9}
      calendarDays={[]} onPrevMonth={() => undefined} onNextMonth={() => undefined}
      onSelectDate={() => undefined} badges={[]} />
  </>;
}
createRoot(document.getElementById("root")!).render(<MemoryRouter><main className="mx-auto max-w-3xl p-4"><Fixture /></main></MemoryRouter>);
