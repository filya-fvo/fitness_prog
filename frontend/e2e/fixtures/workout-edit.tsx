import { useState } from "react";
import { createRoot } from "react-dom/client";
import { WorkoutDayDetails } from "../../src/features/progress/pages/WorkoutDayDetails";
import type { Exercise, Workout } from "../../src/types/workout";
import "../../src/index.css";
import { initializeTheme } from "../../src/theme/theme";

initializeTheme();
const workoutId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const weightId = "33333333-3333-4333-8333-333333333333";
const timedId = "44444444-4444-4444-8444-444444444444";
const cardioId = "55555555-5555-4555-8555-555555555555";
const base: Exercise = {
  id: weightId, name_ru: "Гакк-приседания", muscle_group: "ноги", equipment: "тренажёр",
  description: null, technique: null, common_mistakes: null, difficulty: 2,
  video_url: null, animation_url: null, thumbnail_url: null, media_duration_sec: null,
  media_source: "none", tags: ["load:weight_reps"],
};
const catalog = [base, { ...base, id: timedId, name_ru: "Планка", tags: ["load:timed"] },
  { ...base, id: cardioId, name_ru: "Беговая дорожка", tags: ["load:cardio_machine"] }];
const saved: Workout = {
  id: workoutId, user_id: userId, program_id: null, scheduled_date: "2026-10-05", status: "completed",
  title: "Тренировка после перерыва", ai_notes: "Сохранённая заметка", rpe: 7,
  started_at: "2026-10-05T04:00:00Z", completed_at: "2026-10-05T05:00:00Z", duration_sec: 3600,
  plan: { exercises: catalog.map((ex, index) => ({ exercise_id: ex.id, order: index + 1,
    target_sets: index === 0 ? 3 : 1, target_reps: "12", name_ru: ex.name_ru, rest_sec: 75 })) },
  sets: [
    { id: "66666666-6666-4666-8666-666666666666", workout_id: workoutId, exercise_id: weightId,
      set_number: 1, reps: 14, weight: 200, weight_mode: "total", is_completed: true,
      rest_time_sec: 75, duration_sec: null, note: "Исходный подход", machine_params: null },
    { id: "77777777-7777-4777-8777-777777777777", workout_id: workoutId, exercise_id: timedId,
      set_number: 1, reps: null, weight: null, weight_mode: null, is_completed: true,
      rest_time_sec: 0, duration_sec: 45, note: null, machine_params: null },
    { id: "88888888-8888-4888-8888-888888888888", workout_id: workoutId, exercise_id: cardioId,
      set_number: 1, reps: null, weight: null, weight_mode: null, is_completed: false,
      rest_time_sec: 105, duration_sec: 300, note: null, machine_params: { speed: 4, incline: 2, custom_setting: "keep" } },
  ],
};
function Fixture() {
  const legacy = new URLSearchParams(location.search).has("legacy");
  const [workout, setWorkout] = useState(() => legacy ? {
    ...saved, sets: [{ ...saved.sets[0], weight: 12.25, reps: null, rest_time_sec: null }],
  } : saved);
  const currentCatalog: Exercise[] = legacy ? [{ ...base, weight_rule: "per_hand" }, ...catalog.slice(1)] : catalog;
  const [open, setOpen] = useState(true);
  const previous: Workout = { ...saved, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", scheduled_date: "2026-09-28",
    started_at: "2026-09-28T04:00:00Z", completed_at: "2026-09-28T05:00:00Z",
    sets: saved.sets.map(row => ({ ...row, reps: row.exercise_id === weightId ? 12 : row.reps })) };
  return <main className="mx-auto max-w-xl p-4">
    <button onClick={() => setOpen(true)}>Открыть день</button>
    {open && <WorkoutDayDetails date={saved.scheduled_date} workouts={[workout]} history={[previous, workout]} catalog={currentCatalog}
      onClose={() => setOpen(false)} onChanged={next => { if (next) setWorkout(next); }} />}
    <output className="block break-all" aria-label="Сохранённая тренировка">{JSON.stringify(workout)}</output>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
