import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

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

  it("shows a known scheduling conflict without exposing arbitrary server details", () => {
    const conflict = new axios.AxiosError("Conflict", "ERR_BAD_REQUEST", undefined, undefined, {
      status: 409, statusText: "Conflict", headers: {}, config: { headers: new axios.AxiosHeaders() },
      data: { detail: "Выполненную тренировку перенести или отменить нельзя" },
    });
    expect(toUserMessage(conflict)).toBe("Выполненную тренировку перенести или отменить нельзя");
    conflict.response!.data = { detail: "Internal SQL diagnostic" };
    expect(toUserMessage(conflict)).toBe("Данные уже изменились. Обновите экран и повторите действие.");
  });

  it.each(["ECONNABORTED", "ETIMEDOUT"])("explains an API timeout with code %s", (code) => {
    expect(toUserMessage(new axios.AxiosError("timeout", code))).toBe(
      "Сервис отвечает слишком долго. Попробуйте ещё раз.",
    );
  });
});
