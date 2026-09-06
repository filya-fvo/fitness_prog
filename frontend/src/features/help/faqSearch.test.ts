import { describe, expect, it } from "vitest";

import { FAQ_ARTICLES } from "@/features/help/faqContent";
import { faqArticleById, searchFaqArticles } from "@/features/help/faqSearch";

describe("FAQ search", () => {
  it("finds supplements by the colloquial word for pills", () => {
    expect(searchFaqArticles(FAQ_ARTICLES, "таблетки")[0]?.id).toBe("supplements");
  });

  it("finds schedule instructions for a Friday transfer", () => {
    expect(searchFaqArticles(FAQ_ARTICLES, "перенести пятницу")[0]?.id).toBe("reschedule");
  });

  it("searches both content tabs and supports topic filtering", () => {
    const all = searchFaqArticles(FAQ_ARTICLES, "вес");
    expect(all.some((article) => article.tab === "howto")).toBe(true);
    expect(all.some((article) => article.tab === "knowledge")).toBe(true);
    expect(searchFaqArticles(FAQ_ARTICLES, "", "nutrition").every((article) =>
      article.topics.includes("nutrition"),
    )).toBe(true);
  });

  it("resolves a safe deep link and ignores an unknown one", () => {
    expect(faqArticleById(FAQ_ARTICLES, "nutrition-label")?.tab).toBe("howto");
    expect(faqArticleById(FAQ_ARTICLES, "unknown")).toBeNull();
  });
});
