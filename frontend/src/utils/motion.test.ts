import { afterEach, describe, expect, it, vi } from "vitest";
import { preferredScrollBehavior, prefersReducedMotion } from "./motion";

afterEach(() => vi.unstubAllGlobals());

describe("motion preference", () => {
  it("is safe when a component is rendered without a browser", () => {
    vi.stubGlobal("window", undefined);
    expect(prefersReducedMotion()).toBe(false);
  });

  it("uses the current preference on each scroll, including a changed preference", () => {
    let reduced = false;
    vi.stubGlobal("window", { matchMedia: () => ({ matches: reduced }) });
    expect(preferredScrollBehavior()).toBe("smooth");
    reduced = true;
    expect(preferredScrollBehavior()).toBe("instant");
  });
});
