import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import { ActiveWorkout } from "../../src/features/workout/pages/ActiveWorkout";
import { useUserStore } from "../../src/store/userStore";
import { useWorkoutStore } from "../../src/store/workoutStore";
import { db } from "../../src/db/schema";
import { saveLocalSession } from "../../src/db/syncQueue";
import { draftsFromWorkoutSnapshot } from "../../src/utils/workoutSession";
import type { Workout, Exercise } from "../../src/types/workout";
import "../../src/index.css";
import { initializeTheme } from "../../src/theme/theme";

initializeTheme();
const owner = "22222222-2222-4222-8222-222222222222";
const workoutId = "11111111-1111-4111-8111-111111111111";
const exerciseId = "33333333-3333-4333-8333-333333333333";
const rest = new URLSearchParams(location.search).get("rest") ?? "0";
const exercise: Exercise = { id: exerciseId, name_ru: "Отжимания", muscle_group: "chest", equipment: null,
  tags: ["load:reps_only"], weight_rule: "none", description: null, technique: null, common_mistakes: null,
  difficulty: 1, video_url: null, animation_url: null, thumbnail_url: null, media_duration_sec: null, media_source: "none" };
const workout: Workout = { id: workoutId, user_id: owner, program_id: null, scheduled_date: "2026-10-19", status: "planned",
  ai_notes: null, rpe: null, started_at: new Date().toISOString(), completed_at: null, title: "Личная тренировка", workout_type: "custom",
  plan: { execution_version: 1, title: "Личная тренировка", exercises: [{ exercise_id: exerciseId, name_ru: exercise.name_ru,
    order: 1, target_sets: 2, target_reps: "10", ...(rest === "missing" ? {} : { rest_sec: rest === "null" ? null : Number(rest) }) }] }, sets: [] };
useUserStore.setState({ user: { id: owner, subscription_status: "plus", onboarding_completed: true }, isAuthenticated: true, isAuthLoading: false });
useWorkoutStore.getState().setCatalog([exercise]);
let session = await db.sessions.get(workoutId);
if (!session) {
  // A resumed legacy manual session with repetitions already entered by its owner.
  await saveLocalSession({ clientId: workoutId, serverId: workoutId, workout,
    drafts: draftsFromWorkoutSnapshot(workout).map(draft => ({ ...draft, reps: "10" })) });
  session = (await db.sessions.get(workoutId))!;
}
useWorkoutStore.getState().hydrateSession({ clientId: session.clientId, serverId: session.serverId, workout: session.workout, drafts: session.drafts,
  currentExerciseIndex: session.currentExerciseIndex, execution: session.execution });
// Test observations use the real store/IndexedDB; no production-only testing hooks.
Object.assign(window, { restFixture: { store: useWorkoutStore, db } });
function ContextControls() {
  const navigate = useNavigate();
  async function switchContext(context: "workout" | "owner" | "initial") {
    const id = context === "workout" ? "77777777-7777-4777-8777-777777777777" : workoutId;
    const userId = context === "owner" ? "88888888-8888-4888-8888-888888888888" : owner;
    const nextWorkout = { ...workout, id, user_id: userId };
    useUserStore.setState({ user: { id: userId, subscription_status: "plus", onboarding_completed: true } });
    const drafts = draftsFromWorkoutSnapshot(nextWorkout).map(draft => ({ ...draft, reps: "10" }));
    await saveLocalSession({ clientId: id, serverId: id, workout: nextWorkout, drafts });
    useWorkoutStore.getState().hydrateSession({ clientId: id, serverId: id, workout: nextWorkout, drafts });
    navigate(`/workouts/${id}`);
  }
  return <nav aria-label="Контекст проверки" className="flex flex-wrap gap-2">
    {(["workout", "owner", "initial"] as const).map(context => <button key={context} type="button" onClick={() => void switchContext(context)}>
      {context === "workout" ? "Другая тренировка" : context === "owner" ? "Другой владелец" : "Исходная тренировка"}
    </button>)}
  </nav>;
}
createRoot(document.getElementById("root")!).render(<main className="mx-auto max-w-lg p-3"><MemoryRouter initialEntries={[`/workouts/${workoutId}`]}><ContextControls /><Routes>
  <Route path="/workouts/:workoutId" element={<ActiveWorkout />} />
</Routes></MemoryRouter></main>);
