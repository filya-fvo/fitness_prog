import { describe, expect, it } from "vitest";
import type { UserConfig } from "vite";

import config from "../vite.config";

describe("production build isolation", () => {
  it("keeps verification builds away from the live dist directory", () => {
    expect((config as UserConfig).build?.outDir).toBe(".dist-check");
  });
});
