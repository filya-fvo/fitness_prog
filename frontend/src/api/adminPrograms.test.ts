import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import {
  listAdminPrograms,
  previewAdminProgram,
  publishAdminProgram,
  rollbackAdminProgram,
} from "./adminPrograms";

vi.mock("./client", () => ({ apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));

const program = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Сила",
  description: null,
  target_level: "beginner",
  duration_weeks: 4,
  structure: {},
  workout_type: "strength",
  level: "beginner",
  is_template: true,
  publication_status: "draft",
  program_key: "strength",
  version: 1,
  is_current: false,
  published_at: null,
};

describe("admin programs API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads unpublished versions only through admin view", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { items: [program], total: 1 } });
    await expect(listAdminPrograms()).resolves.toHaveLength(1);
    expect(apiClient.get).toHaveBeenCalledWith("/programs", { params: { admin_view: true } });
  });

  it("validates preview and publication responses", async () => {
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ data: { program: { ...program, publication_status: "published", is_current: true }, message: "Опубликовано" } })
      .mockResolvedValueOnce({ data: { program: { ...program, publication_status: "published", is_current: true }, message: "Возвращено" } })
      .mockResolvedValueOnce({ data: {
        title: "День 2",
        exercises: [{
          exercise_id: "22222222-2222-4222-8222-222222222222",
          order: 1,
          target_sets: 3,
          target_reps: "8-12",
          rest_sec: 60,
          name_ru: "Жим",
        }],
      } });

    await expect(publishAdminProgram(program.id)).resolves.toBe("Опубликовано");
    await expect(rollbackAdminProgram(program.id)).resolves.toBe("Возвращено");
    await expect(previewAdminProgram(program.id, 2)).resolves.toMatchObject({ title: "День 2" });
    expect(apiClient.post).toHaveBeenLastCalledWith(`/programs/${program.id}/preview`, undefined, { params: { day_index: 2 } });
  });
});
