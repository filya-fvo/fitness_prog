import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { ProgramMuscleMap } from "./ProgramMuscleMap";

it("highlights front and rear muscles with readable group chips", () => {
  const markup = renderToStaticMarkup(createElement(ProgramMuscleMap, {
    muscles: [{ group: "legs", exerciseCount: 4 }, { group: "back", exerciseCount: 2 }],
  }));
  expect(markup).toContain('aria-label="Карта мышц программы"');
  expect(markup).toContain('data-view="front"');
  expect(markup).toContain('data-view="back"');
  const [front, back] = markup.match(/<svg[\s\S]*?<\/svg>/g) ?? [];
  expect(front).toContain('data-muscle="legs"');
  expect(front).not.toContain('data-muscle="back"');
  expect(back).toContain('data-muscle="legs"');
  expect(back).toContain('data-muscle="back"');
  expect(markup).toContain("bg-gradient-to-r");
  expect(markup).toContain("Ноги");
  expect(markup).toContain("Спереди");
  expect(markup).toContain("Сзади");
  expect(markup.match(/<svg/g)).toHaveLength(2);
});
