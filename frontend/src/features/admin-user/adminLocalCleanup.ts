import type { AdminResetScope } from "@/api/admin";
import { clearLocalWorkoutData } from "@/db/syncQueue";
import { clearMeasurementHistory, clearWaterHistory } from "@/utils/habits";

export async function clearCurrentUserLocalData(scope: AdminResetScope): Promise<void> {
  if (scope === "workouts" || scope === "all") {
    await clearLocalWorkoutData();
    localStorage.removeItem("fitness_active_workout_started_ms");
  }
  if (scope === "nutrition" || scope === "all") {
    if (scope === "all") {
      localStorage.removeItem("fitness_nutrition_recent_v1");
      localStorage.removeItem("fitness_nutrition_favorites_v1");
      localStorage.removeItem("fitness_habits_v1");
    } else {
      clearWaterHistory();
    }
  }
  if (scope === "measurements") clearMeasurementHistory();
  if (scope === "all") localStorage.removeItem("fitness_profile_draft");
}
