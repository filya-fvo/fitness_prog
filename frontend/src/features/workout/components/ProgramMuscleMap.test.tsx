import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { ProgramMuscleMap } from "./ProgramMuscleMap";

it("uses the shared inset surface and readable group chips", () => {
  const markup = renderToStaticMarkup(createElement(ProgramMuscleMap, {
    muscles: [{ group: "legs", exerciseCount: 4 }],
  }));
  expect(markup).toContain("app-card-inset");
  expect(markup).toContain("app-chip");
  expect(markup).toContain("Ноги");
});
