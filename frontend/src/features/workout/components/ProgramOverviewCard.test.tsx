import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import type { Exercise, Program } from "@/types/workout";
import { ProgramOverviewCard } from "./ProgramOverviewCard";

const program: Program = {
  id: "program-1",
  name: "Силовая программа",
  description: null,
  target_level: "beginner",
  duration_weeks: 4,
  structure: { schedule: [] },
  workout_type: "strength",
  level: "beginner",
  is_template: true,
};

it("uses semantic badge and mismatch statuses", () => {
  const markup = renderToStaticMarkup(createElement(ProgramOverviewCard, {
    program,
    exerciseById: new Map(),
    badge: "Подходит вам",
    reasons: [],
    mismatches: [{ field: "level", message: "уровень", critical: true }],
  }));
  expect(markup).toContain("app-chip-info");
  expect(markup).toContain("app-status-danger");
});

it("shows the training image and body map when program details open", () => {
  const focusedProgram: Program = {
    ...program,
    structure: { schedule: [{ exercises: [{ exercise_name: "Жим" }] }] },
  };
  const exercise: Exercise = {
    id: "press", name_ru: "Жим", muscle_group: "грудь", equipment: null,
    description: null, technique: null, common_mistakes: null, difficulty: 2,
    video_url: null, animation_url: null, thumbnail_url: null, media_duration_sec: null,
    media_source: "none", tags: [],
  };
  const props = {
    program: focusedProgram, exerciseById: new Map([[exercise.id, exercise]]),
    reasons: [], mismatches: [],
  };

  const collapsed = renderToStaticMarkup(createElement(ProgramOverviewCard, { ...props, expanded: false }));
  const expanded = renderToStaticMarkup(createElement(ProgramOverviewCard, { ...props, expanded: true }));

  expect(collapsed).not.toContain("program-detail-hero");
  expect(collapsed).toContain("Грудь");
  expect(expanded).toContain("program-detail-hero");
  expect(expanded).toContain('aria-label="Карта мышц программы"');
});
