import { describe, expect, it } from "vitest";

import type { Exercise } from "@/types/workout";
import { exerciseDescription, exerciseMediaLabels, exerciseMuscles, exerciseSteps } from "./exercisePresentation";

const row = {
  id: "bench",
  name_ru: "Жим штанги лёжа",
  muscle_group: "грудь",
  secondary_muscle_groups: [],
  tags: ["secondary:triceps", "secondary:deltoids"],
  description: "Жим штанги лёжа. Цель: pectorals. Оборудование: barbell. © Gym Visual — https://gymvisual.com/",
  technique: "1. Лягте на скамью.\n2. Опустите штангу к груди.",
  thumbnail_url: "/thumb.png",
  animation_url: "/move.gif",
  video_url: null,
  equipment: "штанга",
  common_mistakes: null,
  difficulty: 3,
  media_duration_sec: null,
  media_source: "none",
} satisfies Exercise;

describe("exercise presentation", () => {
  it("shows real muscle and media information", () => {
    expect(exerciseMuscles(row).map((item) => item.label)).toEqual(["грудь", "Трицепс", "Плечи"]);
    expect(exerciseMediaLabels(row)).toEqual(["Фото", "GIF"]);
  });

  it("uses stored technique and hides generated catalog boilerplate", () => {
    expect(exerciseSteps(row.technique)).toEqual(["Лягте на скамью.", "Опустите штангу к груди."]);
    expect(exerciseDescription(row)).toBeNull();
    expect(exerciseDescription({ ...row, description: "Горизонтальная тяга с собственным весом." })).toBe("Горизонтальная тяга с собственным весом.");
  });
});
