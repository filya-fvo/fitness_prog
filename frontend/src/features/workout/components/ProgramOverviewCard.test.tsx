import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import type { Program } from "@/types/workout";
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
