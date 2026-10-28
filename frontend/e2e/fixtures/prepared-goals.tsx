import { useState } from "react";
import { createRoot } from "react-dom/client";
import { WorkoutDayComposer } from "../../src/features/workout/components/WorkoutDayComposer";
import { buildWorkoutDayPatch } from "../../src/utils/workoutCustomization";
import { initializeTheme } from "../../src/theme/theme";
import type { Exercise, WorkoutPlan, WorkoutPlanExercise } from "../../src/types/workout";
import "../../src/index.css";

initializeTheme();
const names = ["Жим гантелей", "Отжимания", "Планка", "Беговая дорожка", "Старые повторы", "Старое время"];
const catalog = names.map((name_ru, i) => ({ id: `11111111-1111-4111-8111-${String(i + 1).padStart(12, "0")}`, name_ru,
  equipment: i === 0 ? "гантели" : "свой вес", weight_rule: "per_hand", tags: [`load:${i === 0 ? "weight_reps" : i === 2 || i === 5 ? "timed" : i === 3 ? "cardio_machine" : "reps_only"}`] })) as Exercise[];
const targets: WorkoutPlanExercise["target"][] = [
  { kind: "weight_reps", reps_min: 12, reps_max: 15, target_weight: 12.5 },
  { kind: "reps_only", reps_min: 10, reps_max: 10 }, { kind: "timed", duration_sec: 90 }, { kind: "timed", duration_sec: 300 },
];
const base: WorkoutPlan = { exercises: catalog.map((exercise, i) => ({ exercise_id: exercise.id, order: i + 1,
  target_sets: 3, target_reps: i === 5 ? "60 с" : "8", rest_sec: 60, ...(targets[i] ? { target: targets[i], ...(i === 0 ? { weight_mode: "per_hand" as const } : {}) } : {}) })) };
function Fixture() {
  const [plan, setPlan] = useState<WorkoutPlan>(() => JSON.parse(localStorage.getItem("prepared-goals") ?? "null") ?? base);
  return <main className="mx-auto max-w-3xl p-3"><WorkoutDayComposer plan={plan} catalog={catalog} onChange={setPlan} onAdd={() => {}} onReplace={() => {}} onOpenDetail={() => {}} />
    <button className="app-button" onClick={() => { localStorage.setItem("prepared-patch", JSON.stringify(buildWorkoutDayPatch(base, plan))); localStorage.setItem("prepared-goals", JSON.stringify(plan)); }}>Сохранить подготовку</button></main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
