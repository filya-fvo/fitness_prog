import { describe, expect, it } from "vitest";

import { extractTelegramInitDataFromUrl, pathFromStartParam } from "./telegram";

describe("extractTelegramInitDataFromUrl", () => {
  it("reads iOS launch data without depending on the Telegram SDK", () => {
    const initData = "query_id=fresh-ios&user=%7B%22id%22%3A123%7D&auth_date=123&hash=signed";
    const url = `https://fitness.example/?startapp=home#tgWebAppData=${encodeURIComponent(initData)}&tgWebAppVersion=8.0&tgWebAppPlatform=ios`;

    expect(extractTelegramInitDataFromUrl(url)).toBe(initData);
  });

  it("does not treat an arbitrary browser parameter as Telegram authorization", () => {
    expect(extractTelegramInitDataFromUrl("https://fitness.example/?tgWebAppData=fake")).toBe("");
  });
});

describe("pathFromStartParam", () => {
  it("opens the separate measurements screen", () => {
    expect(pathFromStartParam("measurements")).toBe("/measurements");
  });

  it("opens the water controls in the daily check-in", () => {
    expect(pathFromStartParam("water")).toBe("/?checkin=water");
  });

  it("opens the addressed in-app support thread", () => {
    expect(pathFromStartParam("support_3f56b158-86e3-4a3f-8e38-0112f2a4cf1f"))
      .toBe("/support/3f56b158-86e3-4a3f-8e38-0112f2a4cf1f");
  });

  it("opens a validated referral invite without interpreting arbitrary input", () => {
    const token = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
    expect(pathFromStartParam(`i_${token}`)).toBe(`/invite?token=${token}`);
    expect(pathFromStartParam("i_bad token")).toBeNull();
  });
});
