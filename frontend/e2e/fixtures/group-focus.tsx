import { createRoot } from "react-dom/client";
import { useState } from "react";
import { WorkoutDayComposer } from "../../src/features/workout/components/WorkoutDayComposer";
import type { WorkoutPlan } from "../../src/types/workout";
import "../../src/index.css";
import { initializeTheme } from "../../src/theme/theme";
initializeTheme();
const id = (index: number) => `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`;
const initial: WorkoutPlan = { title: "Много связок", day_index: 1, week_phase: "medium", exercises: Array.from({ length: 12 }, (_, index) => ({ exercise_id: id(index), name_ru: `Упражнение ${index + 1}`, order: index + 1, target_sets: 3, target_reps: "8-12", rest_sec: 90 })), groups: Array.from({ length: 4 }, (_, index) => ({ id: id(index + 20), kind: "superset", exercise_ids: [id(index * 2), id(index * 2 + 1)], rounds: 3, transition_sec: 0, round_rest_sec: 90 })) };
function Fixture() { const [plan, setPlan] = useState(initial); return <main className="mx-auto max-w-lg p-4"><h1>Подготовка</h1><WorkoutDayComposer plan={plan} catalog={[]} onChange={setPlan} onAdd={() => {}} onReplace={() => {}} onOpenDetail={() => {}} /></main>; }
createRoot(document.getElementById("root")!).render(<Fixture />);
