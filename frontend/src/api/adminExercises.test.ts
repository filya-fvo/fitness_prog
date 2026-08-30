import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getAdminExercise,
  listAdminExercises,
  preflightAdminExercise,
  type AdminExercisePayload,
} from "./adminExercises";
import { apiClient } from "./client";

const payload: AdminExercisePayload = {
  name_ru: "Жим гантелей",
  muscle_group: "грудь",
  secondary_muscle_groups: ["трицепс"],
  equipment: "гантели",
  description: null,
  technique: null,
  common_mistakes: null,
  difficulty: 2,
  video_url: null,
  animation_url: null,
  thumbnail_url: null,
  media_duration_sec: null,
  media_source: "none",
  tags: [],
  limitations: [],
  weight_rule: "per_hand",
};

describe("admin exercise API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends server-side filters and validates pagination", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: {
      items: [], total: 0, page: 2, page_size: 20,
    } });
    await listAdminExercises({ page: 2, pageSize: 20, muscleGroup: "грудь", mediaQuality: "ready" });
    expect(apiClient.get).toHaveBeenCalledWith("/admin/exercises", { params: expect.objectContaining({
      page: 2, page_size: 20, muscle_group: "грудь", media_quality: "ready",
    }) });
  });

  it("checks the complete payload before saving", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValue({ data: {
      valid: true, media: [], duplicates: [], errors: [],
    } });
    const result = await preflightAdminExercise(payload, "00000000-0000-4000-8000-000000000001");
    expect(result.valid).toBe(true);
    expect(apiClient.post).toHaveBeenCalledWith("/admin/exercises/preflight", {
      ...payload,
      exclude_id: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("loads one exact exercise for an audit link", async () => {
    const item = {
      id: "00000000-0000-4000-8000-000000000001",
      ...payload,
      media_quality: "missing",
      workout_uses: 0,
      program_uses: 0,
      is_archived: false,
      created_at: "2026-08-30T10:00:00Z",
      updated_at: "2026-08-30T10:00:00Z",
    };
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: item });
    await expect(getAdminExercise(item.id)).resolves.toMatchObject({ id: item.id });
    expect(apiClient.get).toHaveBeenCalledWith(`/admin/exercises/${item.id}`);
  });
});
