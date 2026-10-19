import { afterEach, expect, it, vi } from "vitest";
import { apiClient } from "./client";
import { addWorkoutSet, fetchWorkout, workoutPlanSchema } from "./workouts";
import { startProgramWorkout } from "./programs";

const id = "11111111-1111-4111-8111-111111111111";
const exerciseId = "22222222-2222-4222-8222-222222222222";
const method = { set_number: 1, kind: "cluster", parts: [0, 1, 2].map(i => ({ target_reps: 4, target_weight: "100", pause_after_sec: i < 2 ? 20 : 0 })) };
const plan = { execution_version: 2, groups: [], exercises: [{ exercise_id: exerciseId, order: 1, target_sets: 1, set_methods: [method] }] };
const set = { id, workout_id: id, exercise_id: exerciseId, set_number: 1, reps: null, weight: null, weight_mode: "per_hand",
  is_completed: false, execution_kind: "cluster", execution_revision: 2, parts: [
    { id, ordinal: 1, reps: 4, weight: "100", duration_sec: null, status: "completed", rest_after_sec: 20 },
  ] };
const workout = { id, user_id: id, program_id: id, scheduled_date: "2026-10-19", status: "planned", plan, sets: [set] };

afterEach(() => vi.restoreAllMocks());

it("retains methods and numeric targets through plan validation", () => {
  const result = workoutPlanSchema.parse(plan);
  expect(result.execution_version).toBe(2);
  expect(result.exercises[0].set_methods?.[0].parts).toHaveLength(3);
  expect(result.exercises[0].set_methods?.[0].parts[0].target_weight).toBe(100);
});

it("retains recorded parts and revisions on fetch and program start", async () => {
  vi.spyOn(apiClient, "get").mockResolvedValue({ data: workout });
  const fetched = await fetchWorkout(id);
  expect(fetched.sets[0]).toMatchObject({ execution_kind: "cluster", execution_revision: 2, parts: [{ weight: 100 }] });
  vi.spyOn(apiClient, "post").mockResolvedValue({ data: workout });
  const started = await startProgramWorkout({ programId: id, executionVersion: 2 });
  expect(started.sets[0]).toEqual(fetched.sets[0]);
  expect(apiClient.post).toHaveBeenCalledWith(`/programs/${id}/start`, expect.objectContaining({ execution_version: 2 }));
});

it("sends all parts and concurrency identity without flattening the parent", async () => {
  vi.spyOn(apiClient, "post").mockResolvedValue({ data: set });
  await addWorkoutSet({ workoutId: id, exerciseId, setNumber: 1, executionVersion: 2,
    executionKind: "cluster", baseExecutionRevision: 1, clientOperationId: id,
    parts: [{ ...set.parts[0], weight: 100, status: "completed" }],
  });
  expect(apiClient.post).toHaveBeenCalledWith(`/workouts/${id}/sets`, expect.objectContaining({
    execution_version: 2, execution_kind: "cluster", base_execution_revision: 1, client_operation_id: id,
    reps: null, weight: null, parts: [expect.objectContaining({ reps: 4, weight: 100 })],
  }));
});
