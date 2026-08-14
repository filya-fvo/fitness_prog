import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { Shell } from "@/components/layout/Shell";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

const Chat = lazy(() =>
  import("@/features/ai-chat/pages/Chat").then((module) => ({ default: module.Chat })),
);
const DailyLog = lazy(() =>
  import("@/features/nutrition/pages/DailyLog").then((module) => ({ default: module.DailyLog })),
);
const OnboardingPage = lazy(() =>
  import("@/features/onboarding/pages/OnboardingPage").then((module) => ({
    default: module.OnboardingPage,
  })),
);
const ProgressPage = lazy(() =>
  import("@/features/progress/pages/ProgressPage").then((module) => ({
    default: module.ProgressPage,
  })),
);
const ActiveWorkout = lazy(() =>
  import("@/features/workout/pages/ActiveWorkout").then((module) => ({
    default: module.ActiveWorkout,
  })),
);
const ProgramsPage = lazy(() =>
  import("@/features/workout/pages/ProgramsPage").then((module) => ({
    default: module.ProgramsPage,
  })),
);
const WorkoutCatalogPage = lazy(() =>
  import("@/features/workout/pages/WorkoutCatalogPage").then((module) => ({
    default: module.WorkoutCatalogPage,
  })),
);
const ProfilePage = lazy(() =>
  import("@/features/profile/pages/ProfilePage").then((module) => ({
    default: module.ProfilePage,
  })),
);
const AdminPage = lazy(() =>
  import("@/pages/AdminPage").then((module) => ({ default: module.AdminPage })),
);
const HomePage = lazy(() =>
  import("@/pages/HomePage").then((module) => ({ default: module.HomePage })),
);
const MorePage = lazy(() =>
  import("@/pages/MorePage").then((module) => ({ default: module.MorePage })),
);
const TrainHubPage = lazy(() =>
  import("@/pages/TrainHubPage").then((module) => ({ default: module.TrainHubPage })),
);

export function App() {
  return (
    <BrowserRouter>
      <Suspense
        fallback={
          <div className="mx-auto max-w-5xl p-4">
            <PageSkeleton />
          </div>
        }
      >
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<HomePage />} />
            <Route path="onboarding" element={<OnboardingPage />} />
            <Route path="train" element={<TrainHubPage />} />
            <Route path="workouts" element={<WorkoutCatalogPage />} />
            <Route path="programs" element={<ProgramsPage />} />
            <Route path="workouts/active/:workoutId" element={<ActiveWorkout />} />
            <Route path="nutrition" element={<DailyLog />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="progress" element={<ProgressPage />} />
            <Route path="ai" element={<Chat />} />
            <Route path="more" element={<MorePage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
