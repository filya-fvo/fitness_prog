import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getAdminExercise,
  listAdminExercises,
  preflightAdminExercise,
  uploadAdminExerciseMedia,
  type AdminExercisePayload,
} from "./adminExercises";
import { apiClient, resolveApiAssetUrl } from "./client";

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

  it("resolves database media through the API origin without changing stored paths", () => {
    const path = "/exercise-media/00000000-0000-4000-8000-000000000001";
    expect(resolveApiAssetUrl(path, "https://api.example.com/")).toBe(
      `https://api.example.com${path}`,
    );
    expect(resolveApiAssetUrl("/exercise-gifs/local.gif", "https://api.example.com")).toBe(
      "/exercise-gifs/local.gif",
    );
  });

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

  it("uploads exercise media as browser-generated multipart data", async () => {
    const item = {
      id: "00000000-0000-4000-8000-000000000001",
      ...payload,
      animation_url: "/exercise-media/00000000-0000-4000-8000-000000000002",
      media_quality: "ready",
      workout_uses: 0,
      program_uses: 0,
      is_archived: false,
      created_at: "2026-08-30T10:00:00Z",
      updated_at: "2026-08-30T10:00:00Z",
    };
    vi.spyOn(apiClient, "post").mockResolvedValue({ data: {
      field: "animation_url",
      url: item.animation_url,
      mime_type: "image/png",
      size_bytes: 68,
      width: 1,
      height: 1,
      frame_count: 1,
      exercise: item,
    } });

    const file = new File([new Uint8Array([1, 2, 3])], "exercise.png", { type: "image/png" });
    await expect(uploadAdminExerciseMedia(item.id, "animation_url", file)).resolves.toMatchObject({
      url: item.animation_url,
    });
    const [url, form] = vi.mocked(apiClient.post).mock.calls[0];
    expect(url).toBe(`/admin/exercises/${item.id}/media`);
    expect(form).toBeInstanceOf(FormData);
    expect((form as FormData).get("field")).toBe("animation_url");
    expect((form as FormData).get("image")).toBe(file);
    expect(String((form as FormData).get("idempotency_key"))).toMatch(/^[0-9a-f-]{36}$/);
  });
});
