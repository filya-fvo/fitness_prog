import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ExerciseCard } from "./ExerciseCard";
import type { Exercise } from "@/types/workout";

const exercise: Exercise = {
  id: "row",
  name_ru: "Австралийские подтягивания",
  muscle_group: "спина",
  equipment: "свой вес",
  description: null,
  technique: "Длинная инструкция остаётся в деталях упражнения",
  common_mistakes: null,
  difficulty: 2,
  video_url: null,
  animation_url: "/exercise-gifs/0043-qXTaZnJ.gif",
  thumbnail_url: null,
  media_duration_sec: null,
  media_source: "none",
  tags: [],
};

describe("ExerciseCard", () => {
  it("keeps the catalog row compact while retaining technique and add actions", () => {
    const markup = renderToStaticMarkup(
      <ExerciseCard exercise={exercise} selected={false} onSelect={() => {}} onOpenDetail={() => {}} />,
    );

    expect(markup).toContain("/exercise-thumbnails/0043-qXTaZnJ.png");
    expect(markup).toContain("Австралийские подтягивания");
    expect(markup).not.toContain(exercise.technique);
    expect(markup).toContain("Открыть технику: Австралийские подтягивания");
    expect(markup).toContain("Выбрать в тренировку");
  });
});
