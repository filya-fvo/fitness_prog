import { describe, expect, it } from "vitest";

import { NAV_ITEMS, rootSectionForPath } from "./navigation";

describe("root navigation", () => {
  it("defines the approved five sections in order", () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      "Главная",
      "Упражнения",
      "Дневник",
      "Помощь",
      "Профиль",
    ]);
  });

  it.each([
    ["/nutrition", "/"],
    ["/activity", "/"],
    ["/programs", "/train"],
    ["/workouts/active/42", "/train"],
    ["/measurements", "/progress"],
    ["/progress/exercises", "/progress"],
    ["/support/42", "/help-center"],
    ["/ai", "/help-center"],
    ["/notifications", "/profile"],
    ["/admin/system", "/profile"],
  ])("maps %s to %s", (path, root) => {
    expect(rootSectionForPath(path)).toBe(root);
  });
});
