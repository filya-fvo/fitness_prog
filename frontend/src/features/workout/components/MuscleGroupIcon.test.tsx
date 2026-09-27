import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MuscleGroupIcon } from "./MuscleGroupIcon";

describe("MuscleGroupIcon", () => {
  it("shows a filled body silhouette with two highlighted quadriceps", () => {
    const markup = renderToStaticMarkup(<MuscleGroupIcon group="ноги" />);

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('viewBox="0 0 64 96"');
    expect(markup.match(/fill="currentColor"/g)).toHaveLength(2);
    expect(markup).not.toContain(">Н<");
  });

  it("shows the back view and different muscle regions for back and chest", () => {
    const back = renderToStaticMarkup(<MuscleGroupIcon group="спина" />);
    const chest = renderToStaticMarkup(<MuscleGroupIcon group="грудь" />);

    expect(back).toContain('data-view="back"');
    expect(chest).toContain('data-view="front"');
    expect(back).not.toBe(chest);
  });

  it("uses a neutral body for an unknown group without a letter avatar", () => {
    const markup = renderToStaticMarkup(<MuscleGroupIcon group="неизвестно" />);

    expect(markup).toContain('viewBox="0 0 64 96"');
    expect(markup).not.toContain("неизвестно");
  });

  it("can highlight several muscle groups on one body", () => {
    const markup = renderToStaticMarkup(<MuscleGroupIcon group="neutral" groups={["legs", "chest"]} />);

    expect(markup.match(/fill="currentColor"/g)).toHaveLength(4);
  });
});
