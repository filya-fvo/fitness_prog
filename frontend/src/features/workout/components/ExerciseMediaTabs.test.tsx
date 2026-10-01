import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ExerciseMediaTabs } from "./ExerciseMediaTabs";
import type { Exercise } from "@/types/workout";

const exercise: Exercise = {
  id: "squat",
  name_ru: "Приседания",
  muscle_group: "ноги",
  equipment: null,
  description: null,
  technique: null,
  common_mistakes: null,
  difficulty: 2,
  video_url: null,
  animation_url: "/exercise-gifs/0043-qXTaZnJ.gif",
  thumbnail_url: null,
  media_duration_sec: null,
  media_source: "none",
  tags: [],
};

describe("ExerciseMediaTabs", () => {
  it("shows the complete approved image instead of the first-phase thumbnail", () => {
    const markup = renderToStaticMarkup(<ExerciseMediaTabs exercise={{
      ...exercise,
      image_url: "/exercise-images/deadbug-full.webp",
      thumbnail_url: "/exercise-thumbnails/deadbug-start.webp",
    }} />);

    expect(markup).toContain('/exercise-images/deadbug-full.webp');
    expect(markup).not.toContain('/exercise-thumbnails/deadbug-start.webp');
    expect(markup).toContain("object-contain");
    expect(markup).toContain("Анимация");
  });

  it("shows the exercise's static GIF frame in the Photo tab", () => {
    const markup = renderToStaticMarkup(<ExerciseMediaTabs exercise={exercise} />);

    expect(markup).toContain('/exercise-thumbnails/0043-qXTaZnJ.png');
    expect(markup).toContain('alt="Фото: Приседания"');
  });
});
