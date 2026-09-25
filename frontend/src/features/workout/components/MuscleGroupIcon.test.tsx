import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MuscleGroupIcon } from "./MuscleGroupIcon";

describe("MuscleGroupIcon", () => {
  it("fills both quadriceps in the legs icon instead of using an initial", () => {
    const markup = renderToStaticMarkup(<MuscleGroupIcon group="ноги" />);

    expect(markup).toContain('aria-hidden="true"');
    expect(markup.match(/fill="currentColor"/g)).toHaveLength(2);
    expect(markup).not.toContain(">Н<");
  });
});
