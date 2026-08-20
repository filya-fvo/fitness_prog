import { describe, expect, it } from "vitest";

import { previewAiMessage } from "@/utils/aiMessage";

describe("previewAiMessage", () => {
  it("keeps short answers intact", () => {
    expect(previewAiMessage("Короткий ответ", 20)).toBe("Короткий ответ");
  });

  it("cuts a long answer on a word boundary", () => {
    expect(previewAiMessage("Первое второе третье четвёрто", 20)).toBe("Первое второе третье…");
  });
});
