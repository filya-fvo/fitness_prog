import { describe, expect, it } from "vitest";

import { exerciseThumbnailUrl } from "@/utils/exerciseMedia";

describe("exerciseThumbnailUrl", () => {
  it("prefers an explicit thumbnail", () => {
    expect(exerciseThumbnailUrl({
      animation_url: "/exercise-gifs/squat.gif",
      thumbnail_url: "/custom/squat.webp",
    })).toBe("/custom/squat.webp");
  });

  it("maps a local GIF to its generated static first frame", () => {
    expect(exerciseThumbnailUrl({
      animation_url: "/exercise-gifs/0043-qXTaZnJ.gif",
      thumbnail_url: null,
    })).toBe("/exercise-thumbnails/0043-qXTaZnJ.png");
  });

  it("does not invent a thumbnail for an external animation", () => {
    expect(exerciseThumbnailUrl({
      animation_url: "https://example.com/exercise.gif",
      thumbnail_url: null,
    })).toBeNull();
  });
});
