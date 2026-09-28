import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { DiarySections } from "./DiarySections";

it("keeps the overview visible above detailed analytics", () => {
  const markup = renderToStaticMarkup(createElement(DiarySections, {
    overview: createElement("div", {}, "Обзор тренировок"),
    analytics: createElement("div", {}, "Подробные графики"),
    showAnalytics: true,
  }));
  expect(markup.indexOf("Обзор тренировок")).toBeLessThan(markup.indexOf("Подробные графики"));
  expect(markup).toContain('aria-label="Обзор"');
  expect(markup).toContain('aria-label="Подробная аналитика"');
});

it("does not mount detailed analytics in basic mode", () => {
  const markup = renderToStaticMarkup(createElement(DiarySections, {
    overview: createElement("div", {}, "Обзор тренировок"),
    analytics: createElement("div", {}, "Подробные графики"),
    showAnalytics: false,
  }));
  expect(markup).toContain("Обзор тренировок");
  expect(markup).not.toContain("Подробные графики");
});
