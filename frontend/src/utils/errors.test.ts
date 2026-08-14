import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toUserMessage } from "@/utils/errors";

describe("user-facing errors", () => {
  beforeEach(() => vi.stubGlobal("navigator", { onLine: true }));
  afterEach(() => vi.unstubAllGlobals());

  it("does not expose an English technical exception", () => {
    expect(toUserMessage(new Error("Cannot restore workout session"), "Не удалось восстановить тренировку"))
      .toBe("Не удалось восстановить тренировку");
  });

  it("keeps a meaningful Russian error", () => {
    expect(toUserMessage(new Error("Тренировка уже удалена"))).toBe("Тренировка уже удалена");
  });
});
