import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { Shell } from "@/components/layout/Shell";
import { Chat } from "@/features/ai-chat/pages/Chat";
import { DailyLog } from "@/features/nutrition/pages/DailyLog";
import { OnboardingPage } from "@/features/onboarding/pages/OnboardingPage";
import { ProgressPage } from "@/features/progress/pages/ProgressPage";
import { ActiveWorkout } from "@/features/workout/pages/ActiveWorkout";
import { ProgramsPage } from "@/features/workout/pages/ProgramsPage";
import { WorkoutCatalogPage } from "@/features/workout/pages/WorkoutCatalogPage";
import { ProfilePage } from "@/features/profile/pages/ProfilePage";
import { AdminPage } from "@/pages/AdminPage";
import { HomePage } from "@/pages/HomePage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<HomePage />} />
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route path="workouts" element={<WorkoutCatalogPage />} />
          <Route path="programs" element={<ProgramsPage />} />
          <Route path="workouts/active/:workoutId" element={<ActiveWorkout />} />
          <Route path="nutrition" element={<DailyLog />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="progress" element={<ProgressPage />} />
          <Route path="ai" element={<Chat />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
