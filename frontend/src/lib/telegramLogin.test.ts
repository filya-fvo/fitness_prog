import { describe, expect, it } from "vitest";

import { addTelegramOAuthOrigin } from "@/lib/telegramLogin";

describe("addTelegramOAuthOrigin", () => {
  it("adds the current application origin to the Telegram OAuth popup", () => {
    const result = addTelegramOAuthOrigin(
      "https://oauth.telegram.org/auth?client_id=123&response_type=post_message",
      "https://app.filfitclub.ru",
    );

    expect(new URL(result.toString()).searchParams.get("origin")).toBe(
      "https://app.filfitclub.ru",
    );
  });

  it("does not modify links outside the Telegram OAuth endpoint", () => {
    const rawUrl = "https://example.org/auth?client_id=123";

    expect(addTelegramOAuthOrigin(rawUrl, "https://app.filfitclub.ru")).toBe(rawUrl);
  });
});
