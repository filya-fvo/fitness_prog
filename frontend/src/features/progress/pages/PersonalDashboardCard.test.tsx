import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";

import { PersonalDashboardCard } from "./PersonalDashboardCard";

it("puts the diary mode control before guidance while keeping the action available", () => {
  const markup = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(PersonalDashboardCard, {
    goal: "maintain", level: "beginner", depth: "advanced", saving: false, error: null,
    onExpandedChange: () => undefined,
    guidance: {
      dataLabel: "Данные недели", dataDescription: "Описание",
      comparisonLabel: "Изменение", comparison: "Результат",
      action: "Открыть тренировку", actionHref: "/",
    },
  })));
  expect(markup.indexOf("Режим Дневника")).toBeLessThan(markup.indexOf("Данные недели"));
  expect(markup).toContain('href="/"');
});
