import type { FaqArticle, FaqTopic } from "@/features/help/faqContent";

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

const SYNONYM_GROUPS = [
  ["таблетка", "витамин", "бад", "добавка", "препарат"],
  ["перенести", "перенос", "сдвинуть", "заменить"],
  ["пятница", "пт"],
  ["еда", "питание", "продукт", "блюдо"],
  ["этикетка", "фото", "распознавание", "ocr"],
  ["оповещение", "уведомление", "напоминание"],
  ["телеграм", "telegram", "бот"],
  ["офлайн", "offline", "сеть", "интернет"],
  ["график", "динамика", "прогресс", "статистика"],
] as const;

function stem(value: string): string {
  return value.length > 5 ? value.slice(0, 5) : value;
}

function alternatives(token: string): string[] {
  const tokenStem = stem(token);
  const group = SYNONYM_GROUPS.find((items) => items.some((item) => stem(item) === tokenStem));
  return group ? [...group] : [token];
}

function articleText(article: FaqArticle): string {
  return normalize([
    article.title,
    article.summary,
    ...article.points,
    ...(article.keywords || []),
  ].join(" "));
}

export function searchFaqArticles(
  articles: readonly FaqArticle[],
  query: string,
  topic: FaqTopic | null = null,
): FaqArticle[] {
  const tokens = normalize(query).split(" ").filter(Boolean);
  return articles
    .filter((article) => !topic || article.topics.includes(topic))
    .map((article) => {
      const text = articleText(article);
      const title = normalize(article.title);
      const keywords = normalize((article.keywords || []).join(" "));
      const matches = tokens.every((token) =>
        alternatives(token).some((candidate) => text.includes(stem(normalize(candidate)))),
      );
      const score = tokens.reduce((total, token) => {
        const tokenStem = stem(token);
        return total
          + (title.includes(tokenStem) ? 4 : 0)
          + (keywords.includes(tokenStem) ? 3 : 0);
      }, 0);
      return { article, matches, score };
    })
    .filter((item) => item.matches)
    .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title, "ru"))
    .map((item) => item.article);
}

export function faqArticleById(articles: readonly FaqArticle[], id: string | null): FaqArticle | null {
  if (!id) return null;
  return articles.find((article) => article.id === id) ?? null;
}
