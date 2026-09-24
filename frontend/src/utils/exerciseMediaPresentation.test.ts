import { describe, expect, it } from "vitest";

import { resolveExercisePreview } from "@/utils/exerciseMediaPresentation";

describe("resolveExercisePreview", () => {
  it("prefers a supplied thumbnail over an animation", () => {
    expect(resolveExercisePreview({ muscle_group: "грудь", thumbnail_url: "/thumb.png", animation_url: "/move.gif" }))
      .toEqual({ kind: "image", src: "/thumb.png" });
  });

  it("uses an animation when no thumbnail can be shown", () => {
    expect(resolveExercisePreview({ muscle_group: "ягодицы", thumbnail_url: null, animation_url: "/move.gif" }))
      .toEqual({ kind: "animation-frame", src: "/move.gif" });
  });

  it("returns an anatomical fallback instead of a letter", () => {
    expect(resolveExercisePreview({ muscle_group: "ноги", thumbnail_url: null, animation_url: null }))
      .toEqual({ kind: "anatomy", group: "legs" });
  });
});
