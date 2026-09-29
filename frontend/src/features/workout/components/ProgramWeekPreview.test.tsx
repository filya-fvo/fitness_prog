import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { ProgramWeekPreview } from "./ProgramWeekPreview";

it("shows a compact seven-day rhythm with real training and rest counts", () => {
  const markup = renderToStaticMarkup(<ProgramWeekPreview trainingDays={3} />);
  expect(markup.match(/: тренировка/g)).toHaveLength(3);
  expect(markup.match(/: отдых/g)).toHaveLength(4);
  expect(markup).toContain("План на неделю");
});
