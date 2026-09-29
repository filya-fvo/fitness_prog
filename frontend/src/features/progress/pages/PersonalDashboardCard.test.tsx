import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { PersonalDashboardCard } from "./PersonalDashboardCard";

it("keeps the diary mode control compact and accessible", () => {
  const markup = renderToStaticMarkup(createElement(PersonalDashboardCard, {
    level: "beginner", depth: "advanced", saving: false, error: null,
    onExpandedChange: () => undefined,
  }));
  expect(markup).toContain('aria-label="Режим Дневника"');
  expect(markup).toContain('aria-pressed="true"');
  expect(markup).toContain("Основное");
  expect(markup).toContain("Расширенно");
});
