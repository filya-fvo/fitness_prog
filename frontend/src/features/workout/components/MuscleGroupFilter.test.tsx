import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { MuscleGroupFilter } from "./MuscleGroupFilter";

it("puts major muscle groups in the first mobile row and keeps others reachable", () => {
  const markup = renderToStaticMarkup(<MuscleGroupFilter
    groups={["бицепс", "грудь", "кардио", "кор", "мобильность", "ноги", "плечи", "спина"]}
    value="" onChange={() => {}} kind="" onKindChange={() => {}}
  />);
  const visible = [...markup.matchAll(/aria-pressed="false"/g)].length;
  expect(visible).toBeGreaterThanOrEqual(5);
  expect(markup.indexOf("грудь")).toBeLessThan(markup.indexOf("бицепс"));
  expect(markup).toContain("Все группы (8)");
});
