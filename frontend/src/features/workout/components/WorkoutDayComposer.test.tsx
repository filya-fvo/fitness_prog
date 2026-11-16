import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { WorkoutPlan } from "@/types/workout";
import { WorkoutDayComposer } from "./WorkoutDayComposer";

const plan: WorkoutPlan = { execution_version: 2, groups: [{ id: "group", kind: "superset", exercise_ids: ["a", "b"], rounds: 3, transition_sec: 0, round_rest_sec: 90 }], exercises: ["a", "b"].map((exercise_id, index) => ({ exercise_id, name_ru: exercise_id, order: index + 1, target_sets: 3 })) };

it("shows a direct unlink action for each exercise of a prepared superset", () => {
  const markup = renderToStaticMarkup(<WorkoutDayComposer plan={plan} catalog={[]} onChange={() => {}} onAdd={() => {}} onReplace={() => {}} onOpenDetail={() => {}} />);
  expect(markup.match(/Разъединить суперсет/g)).toHaveLength(2);
  expect(markup).toContain("Разъединение сохранит все упражнения");
  expect(markup).toContain('role="status" aria-live="polite"');
});
