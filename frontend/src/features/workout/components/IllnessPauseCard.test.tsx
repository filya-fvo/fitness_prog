import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { IllnessPause } from "@/api/workouts";
import { IllnessPauseCard } from "./IllnessPauseCard";

const base: IllnessPause = {
  active: false,
  started_on: null,
  recovery_choice_pending: false,
  recovery_light_week_active: false,
};

function markup(status: IllnessPause) {
  return renderToStaticMarkup(createElement(IllnessPauseCard, { status, onChange: () => {} }));
}

describe("IllnessPauseCard visual states", () => {
  it("uses distinct semantic cards for pause, return choice and recovery", () => {
    expect(markup({ ...base, active: true, started_on: "2026-09-25" })).toContain("app-card-ocean");
    expect(markup({ ...base, recovery_choice_pending: true })).toContain("app-card-warning");
    expect(markup({ ...base, recovery_light_week_active: true })).toContain("app-card-success");
    expect(markup(base)).toContain("app-card");
  });
});
