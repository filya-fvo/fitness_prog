import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ExerciseMediaPlayer } from "./ExerciseMediaPlayer";
import type { Exercise } from "@/types/workout";

const exercise: Exercise = {
  id: "deadbug", name_ru: "Мёртвый жук", muscle_group: "кор", equipment: null,
  description: null, technique: null, common_mistakes: null, difficulty: 2,
  video_url: null, animation_url: "/exercise-gifs/deadbug.gif",
  image_url: "/exercise-images/deadbug.webp", thumbnail_url: "/exercise-thumbnails/deadbug-start.webp",
  media_duration_sec: null, media_source: "none", tags: ["gymvisual"],
};

describe("ExerciseMediaPlayer approved illustrations", () => {
  it("shows the full illustration in a workout without third-party GIF attribution", () => {
    const markup = renderToStaticMarkup(<ExerciseMediaPlayer exercise={exercise} />);
    expect(markup).toContain('/exercise-images/deadbug.webp');
    expect(markup).not.toContain('/exercise-gifs/deadbug.gif');
    expect(markup).not.toContain("© Gym Visual");
  });

  it("keeps the animation available explicitly, with its original credit", () => {
    const markup = renderToStaticMarkup(<ExerciseMediaPlayer exercise={exercise} preferAnimation />);
    expect(markup).toContain('/exercise-gifs/deadbug.gif');
    expect(markup).toContain("© Gym Visual");
  });

  it("uses only the initial phase for compact previews", () => {
    const markup = renderToStaticMarkup(<ExerciseMediaPlayer exercise={exercise} preview />);
    expect(markup).toContain('/exercise-thumbnails/deadbug-start.webp');
    expect(markup).not.toContain('/exercise-images/deadbug.webp');
  });

  it("treats an uploaded illustration without a filename extension as a static image", () => {
    const markup = renderToStaticMarkup(<ExerciseMediaPlayer exercise={{ ...exercise, image_url: "/exercise-media/11111111-1111-4111-8111-111111111111" }} />);
    expect(markup).toContain("/exercise-media/11111111-1111-4111-8111-111111111111");
    expect(markup).not.toContain("Остановить анимацию");
    expect(markup).not.toContain("Воспроизвести анимацию");
  });

  it("keeps an uploaded thumbnail static in a compact preview", () => {
    const markup = renderToStaticMarkup(<ExerciseMediaPlayer exercise={{ ...exercise, thumbnail_url: "/exercise-media/22222222-2222-4222-8222-222222222222" }} preview />);
    expect(markup).toContain("/exercise-media/22222222-2222-4222-8222-222222222222");
    expect(markup).not.toContain("Остановить анимацию");
  });
});
