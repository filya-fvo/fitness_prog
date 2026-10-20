import { afterEach, beforeEach, expect, it, vi } from "vitest";
beforeEach(() => vi.stubGlobal("navigator", { onLine: true }));
afterEach(() => vi.unstubAllGlobals());
import { workoutSyncError } from "./workoutSyncErrors";
const failure = (status: number) => Object.assign(new Error(`Request failed with status ${status}`), { isAxiosError: true, response: { status, data: { detail: "internal diagnostic must not appear" } } });
it("explains a structured revision conflict without exposing server diagnostics", () => {
  const message = workoutSyncError(failure(409));
  expect(message).toContain("изменились на сервере");
  expect(message).toContain("сохранены на устройстве");
  expect(message).not.toContain("internal diagnostic");
});
it("keeps ordinary network failures readable and retains a useful local domain reason", () => {
  expect(workoutSyncError(failure(503))).toContain("сохранены на устройстве");
  expect(workoutSyncError(failure(503))).not.toContain("Request failed");
  expect(workoutSyncError(new Error("Программа изменилась. Подготовка сохранена на устройстве"))).toBe("Программа изменилась. Подготовка сохранена на устройстве");
});
