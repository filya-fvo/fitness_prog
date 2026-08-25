import { describe, expect, it } from "vitest";

import {
  readThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
} from "@/theme/theme";

describe("theme preference", () => {
  it("uses an explicit light or dark choice", () => {
    expect(resolveTheme("light", "dark", true)).toBe("light");
    expect(resolveTheme("dark", "light", false)).toBe("dark");
  });

  it("follows Telegram before the browser system theme", () => {
    expect(resolveTheme("system", "light", true)).toBe("light");
    expect(resolveTheme("system", "dark", false)).toBe("dark");
  });

  it("falls back to the browser system theme", () => {
    expect(resolveTheme("system", undefined, true)).toBe("dark");
    expect(resolveTheme("system", undefined, false)).toBe("light");
  });

  it("reads only supported stored values", () => {
    expect(readThemePreference({ getItem: () => "dark" })).toBe("dark");
    expect(readThemePreference({ getItem: () => "unexpected" })).toBe("system");
    expect(readThemePreference({ getItem: (key) => key === THEME_STORAGE_KEY ? "light" : null })).toBe("light");
  });
});
