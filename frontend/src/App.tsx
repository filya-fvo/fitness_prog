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
const MeasurementsPage = lazy(() =>
  import("@/features/measurements/pages/MeasurementsPage").then((module) => ({
    default: module.MeasurementsPage,
  })),
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
const AdminSystemPage = lazy(() =>
  import("@/features/admin-system/pages/AdminSystemPage").then((module) => ({
    default: module.AdminSystemPage,
  })),
);
const AdminAuditPage = lazy(() =>
  import("@/features/admin-audit/pages/AdminAuditPage").then((module) => ({
    default: module.AdminAuditPage,
  })),
);
const AdminUserPage = lazy(() =>
  import("@/features/admin-user/pages/AdminUserPage").then((module) => ({
    default: module.AdminUserPage,
  })),
);
const AdminBroadcastsPage = lazy(() =>
  import("@/features/admin-broadcasts/pages/AdminBroadcastsPage").then((module) => ({
    default: module.AdminBroadcastsPage,
  })),
);
const AdminExercisesPage = lazy(() =>
  import("@/features/admin-exercises/pages/AdminExercisesPage").then((module) => ({
    default: module.AdminExercisesPage,
  })),
);
const AdminProgramsPage = lazy(() =>
  import("@/features/admin-programs/pages/AdminProgramsPage").then((module) => ({
    default: module.AdminProgramsPage,
  })),
);
const AdminSupportPage = lazy(() =>
  import("@/features/admin-support/pages/AdminSupportPage").then((module) => ({
    default: module.AdminSupportPage,
  })),
);
const SupportPage = lazy(() =>
  import("@/features/support/pages/SupportPage").then((module) => ({ default: module.SupportPage })),
);
const SupportTicketPage = lazy(() =>
  import("@/features/support/pages/SupportTicketPage").then((module) => ({
    default: module.SupportTicketPage,
  })),
);
const InvitePage = lazy(() =>
  import("@/features/invites/pages/InvitePage").then((module) => ({
    default: module.InvitePage,
  })),
);
const SocialPage = lazy(() =>
  import("@/features/social/pages/SocialPage").then((module) => ({
    default: module.SocialPage,
  })),
);
const HomePage = lazy(() =>
  import("@/pages/HomePage").then((module) => ({ default: module.HomePage })),
);
const MorePage = lazy(() =>
  import("@/pages/MorePage").then((module) => ({ default: module.MorePage })),
);
const HelpPage = lazy(() =>
  import("@/pages/HelpPage").then((module) => ({ default: module.HelpPage })),
);
const KnowledgeBasePage = lazy(() =>
  import("@/pages/KnowledgeBasePage").then((module) => ({ default: module.KnowledgeBasePage })),
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
          <Route
            path="help"
            element={(
              <div className="app-shell min-h-screen bg-transparent px-4 pb-8 pt-[calc(1rem+env(safe-area-inset-top))] text-tg-text">
                <HelpPage />
              </div>
            )}
          />
          <Route
            path="knowledge"
            element={(
              <div className="app-shell min-h-screen bg-transparent px-4 pb-8 pt-[calc(1rem+env(safe-area-inset-top))] text-tg-text">
                <KnowledgeBasePage />
              </div>
            )}
          />
          <Route element={<Shell />}>
            <Route index element={<HomePage />} />
            <Route path="onboarding" element={<OnboardingPage />} />
            <Route path="train" element={<TrainHubPage />} />
            <Route path="workouts" element={<WorkoutCatalogPage />} />
            <Route path="programs" element={<ProgramsPage />} />
            <Route path="workouts/active/:workoutId" element={<ActiveWorkout />} />
            <Route path="nutrition" element={<DailyLog />} />
            <Route path="measurements" element={<MeasurementsPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="progress" element={<ProgressPage />} />
            <Route path="ai" element={<Chat />} />
            <Route path="more" element={<MorePage />} />
            <Route path="support" element={<SupportPage />} />
            <Route path="support/:ticketId" element={<SupportTicketPage />} />
            <Route path="invite" element={<InvitePage />} />
            <Route path="social" element={<SocialPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="admin/system" element={<AdminSystemPage />} />
            <Route path="admin/audit" element={<AdminAuditPage />} />
            <Route path="admin/users/:userId" element={<AdminUserPage />} />
            <Route path="admin/broadcasts" element={<AdminBroadcastsPage />} />
            <Route path="admin/exercises" element={<AdminExercisesPage />} />
            <Route path="admin/programs" element={<AdminProgramsPage />} />
            <Route path="admin/support" element={<AdminSupportPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
