import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ActiveWorkout } from "../../src/features/workout/pages/ActiveWorkout";
import { useUserStore } from "../../src/store/userStore";
import { useWorkoutStore } from "../../src/store/workoutStore";
import { db } from "../../src/db/schema";
import { saveLocalSession } from "../../src/db/syncQueue";
import { draftsFromWorkoutSnapshot } from "../../src/utils/workoutSession";
import { startProgramSession } from "../../src/features/workout/services/programWorkoutStart";
import { apiClient } from "../../src/api/client";
import type { Workout, WorkoutPlan, Exercise } from "../../src/types/workout";
import "../../src/index.css";
import { initializeTheme } from "../../src/theme/theme";

initializeTheme();
const owner = "22222222-2222-4222-8222-222222222222";
const workoutId = "11111111-1111-4111-8111-111111111111";
const a = "33333333-3333-4333-8333-333333333333";
const b = "44444444-4444-4444-8444-444444444444";
const params = new URLSearchParams(location.search);
const kind = params.get("kind") ?? "cluster";
const targetCase = params.get("target");
const onlineTargetStart = targetCase === "weight" || targetCase === "reps" || targetCase === "timed-v2";
const targetProgram = "88888888-8888-4888-8888-888888888888";
const internalPause = params.get("rest") === "short" ? 1 : 20;
const grouped = kind.includes("group");
const expanded = kind.includes("triset") || kind.includes("circuit");
const c = "77777777-7777-4777-8777-777777777777";
const catalog: Exercise[] = [
  { id: a, name_ru: "Жим штанги лёжа" }, { id: b, name_ru: "Сгибания со штангой" },
].map(row => ({ ...row, muscle_group: "arms", equipment: "штанга", tags: ["load:weight_reps"], weight_rule: "total",
  description: null, technique: "Подконтрольное движение", common_mistakes: null, difficulty: 1, video_url: null,
  animation_url: null, thumbnail_url: null, media_duration_sec: null, media_source: "none" }));
if (expanded) catalog.push({ ...catalog[0], id: c, name_ru: "Планка", tags: ["load:timed"], weight_rule: "none" });
const plan: WorkoutPlan = { execution_version: 2, title: "Сложная тренировка", exercises: [
  { exercise_id: a, name_ru: catalog[0].name_ru, order: 1, target_sets: grouped || kind.endsWith("next") ? 2 : 1,
    target_reps: "4", rest_sec: 120, set_methods: [{ set_number: 1, kind: kind.startsWith("drop") ? "drop" : "cluster",
      parts: [0, 1, 2].map(i => ({ target_reps: 4, target_weight: kind.startsWith("drop") ? 30 - i * 5 : 100,
        pause_after_sec: kind.startsWith("drop") || i === 2 ? 0 : internalPause })) }] },
  ...(grouped ? [{ exercise_id: b, name_ru: catalog[1].name_ru, order: 2, target_sets: 2, target_reps: "8", rest_sec: 120 }] : []),
  ...(expanded ? [{ exercise_id: c, name_ru: "Планка", order: 3, target_sets: 2, target_reps: "40 с", rest_sec: 60 }] : []),
], groups: grouped ? [{ id: "55555555-5555-4555-8555-555555555555", kind: kind.includes("triset") ? "triset" : kind.includes("circuit") ? "circuit" : "superset", exercise_ids: expanded ? [a, b, c] : [a, b], rounds: 2, transition_sec: 0, round_rest_sec: 90 }] : [] };
if (targetCase === "timed" || targetCase === "timed-v2") {
  catalog[0] = { ...catalog[0], name_ru: "Планка", tags: ["load:timed"], weight_rule: "none" };
  plan.execution_version = targetCase === "timed" ? 1 : 2;
  plan.exercises = [{ exercise_id: a, name_ru: "Планка", order: 1, target_sets: 3, target_reps: "30 с", rest_sec: 60, target: { kind: "timed", duration_sec: 95 } }];
} else if (targetCase === "weight") {
  plan.exercises[0] = { ...plan.exercises[0], target_sets: 2, target: { kind: "weight_reps", reps_min: 12, reps_max: 15, target_weight: 40 } };
} else if (targetCase === "reps") {
  catalog[0] = { ...catalog[0], name_ru: "Отжимания", tags: ["load:reps_only"], weight_rule: "none" };
  plan.exercises = [{ exercise_id: a, name_ru: "Отжимания", order: 1, target_sets: 1, target: { kind: "reps_only", reps_min: 12, reps_max: 15 } }];
}
const workout: Workout = { id: workoutId, user_id: owner, program_id: null, scheduled_date: "2026-10-19", status: "planned",
  ai_notes: null, rpe: null, started_at: new Date().toISOString(), completed_at: null, title: plan.title, workout_type: "custom", plan, sets: plan.exercises.flatMap(row =>
    Array.from({ length: row.target_sets }, (_, i) => ({ id: crypto.randomUUID(), workout_id: workoutId, exercise_id: row.exercise_id,
      set_number: i + 1, reps: null, weight: null, weight_mode: row.weight_mode ?? null, rest_time_sec: row.rest_sec ?? 60, is_completed: false,
      duration_sec: null, machine_params: null, note: row.note ?? null, is_skipped: false,
      execution_kind: row.set_methods?.find(method => method.set_number === i + 1)?.kind ?? "standard", execution_revision: 0,
      parts: (row.set_methods?.find(method => method.set_number === i + 1)?.parts ?? []).map((part, ordinal) => ({ id: crypto.randomUUID(),
        ordinal: ordinal + 1, reps: null, weight: null, duration_sec: null, status: "pending", rest_after_sec: part.pause_after_sec })),
    }))) };
// The V1 modal control deliberately starts with missing slots; actual typed starts are V2.
if (targetCase === "timed") workout.sets = [];
if (onlineTargetStart) {
  workout.program_id = targetProgram;
  // Synthetic transport returns the same all-slot shape as backend _create_set_slots.
  apiClient.interceptors.request.use(config => {
    if (config.url === `/programs/${targetProgram}/start`) config.adapter = async () => ({ data: workout, status: 200, statusText: "OK", headers: {}, config });
    return config;
  });
}
useUserStore.setState({ user: { id: owner, subscription_status: "plus", onboarding_completed: true }, isAuthenticated: true, isAuthLoading: false });
useWorkoutStore.getState().setCatalog(catalog);
let session = onlineTargetStart ? await db.sessions.filter(row => row.workout.id === workoutId).first() : await db.sessions.get(workoutId);
if (!session && onlineTargetStart) session = await startProgramSession({ programId: targetProgram, scheduledDate: workout.scheduled_date, dayIndex: 1 });
if (!session) {
  await saveLocalSession({ clientId: workoutId, serverId: workoutId, workout, drafts: draftsFromWorkoutSnapshot(workout) });
  session = (await db.sessions.get(workoutId))!;
}
useWorkoutStore.getState().hydrateSession({ clientId: session.clientId, serverId: session.serverId, workout: session.workout, drafts: session.drafts,
  currentExerciseIndex: session.currentExerciseIndex, execution: session.execution });
createRoot(document.getElementById("root")!).render(<main className="mx-auto max-w-lg p-3"><MemoryRouter initialEntries={[`/workouts/${workoutId}`]}><Routes>
  <Route path="/workouts/:workoutId" element={<ActiveWorkout />} />
</Routes></MemoryRouter></main>);
