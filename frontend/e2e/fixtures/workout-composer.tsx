import { createRoot } from "react-dom/client";
import { PlannedWorkoutEditor } from "../../src/features/workout/components/PlannedWorkoutEditor";
import "../../src/index.css";
import { initializeTheme } from "../../src/theme/theme";
initializeTheme();
createRoot(document.getElementById("root")!).render(<main className="mx-auto max-w-md p-4"><h1>Чередование акцентов</h1><PlannedWorkoutEditor programId="33333333-3333-4333-8333-333333333333" scheduledDate="2026-10-19" dayIndex={1} weekPhase="medium" /></main>);
