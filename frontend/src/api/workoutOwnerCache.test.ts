import { afterEach, expect, it, vi } from "vitest";
import { useUserStore } from "@/store/userStore";
import { apiClient } from "./client";
import { fetchWorkout, addWorkoutSet } from "./workouts";
const a = "22222222-2222-4222-8222-222222222222", b = "33333333-3333-4333-8333-333333333333", exercise = "44444444-4444-4444-8444-444444444444";
function login(id: string) { useUserStore.setState({ user: { id, subscription_status: "plus", onboarding_completed: true } }); }
function workout(id: string) { return { id, user_id: a, program_id: null, scheduled_date: "2026-10-20", status: "planned", ai_notes: null, rpe: null, started_at: null, completed_at: null, plan: { exercises: [] }, sets: [] }; }
afterEach(() => { vi.restoreAllMocks(); useUserStore.setState({ user: null }); });
it("does not return another account's cached workout during the grace period", async () => {
  const id = crypto.randomUUID(); login(a);
  const get = vi.spyOn(apiClient, "get").mockResolvedValueOnce({ data: workout(id) }).mockRejectedValueOnce(new Error("forbidden"));
  await fetchWorkout(id); login(b);
  await expect(fetchWorkout(id)).rejects.toThrow("forbidden");
  expect(get).toHaveBeenCalledTimes(2);
});
it("separates in-flight requests and rejects an old account response", async () => {
  const id = crypto.randomUUID(); login(a);
  let release!: (value: { data: ReturnType<typeof workout> }) => void;
  const get = vi.spyOn(apiClient, "get").mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockRejectedValueOnce(new Error("forbidden"));
  const first = fetchWorkout(id), old = expect(first).rejects.toThrow("Аккаунт изменился");
  login(b);
  const second = expect(fetchWorkout(id)).rejects.toThrow("forbidden");
  release({ data: workout(id) });
  await Promise.all([old, second]); expect(get).toHaveBeenCalledTimes(2);
});
it("does not repopulate the cache from a read that predates a set write", async () => {
  const id = crypto.randomUUID(); login(a);
  let release!: (value: { data: ReturnType<typeof workout> }) => void;
  const get = vi.spyOn(apiClient, "get").mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValue({ data: workout(id) });
  const first = fetchWorkout(id), stale = expect(first).rejects.toThrow("Запись тренировки изменилась");
  vi.spyOn(apiClient, "post").mockResolvedValue({ data: { id: crypto.randomUUID(), workout_id: id, exercise_id: exercise, set_number: 1, reps: 8, weight: 50, is_completed: true } });
  await addWorkoutSet({ workoutId: id, exerciseId: exercise, setNumber: 1, reps: 8, weight: 50, isCompleted: true });
  release({ data: workout(id) }); await stale;
  await fetchWorkout(id); expect(get).toHaveBeenCalledTimes(2);
});
