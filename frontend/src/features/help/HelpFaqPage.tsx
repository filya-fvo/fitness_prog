import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { Header } from "@/components/layout/Header";
import {
  FAQ_ARTICLES,
  FAQ_SOURCES,
  type FaqArticle,
  type FaqTab,
  type FaqTopic,
} from "@/features/help/faqContent";
import { faqArticleById, searchFaqArticles } from "@/features/help/faqSearch";
import { trackEvent } from "@/lib/analytics";

const QUICK_TOPICS: Array<{ id: FaqTopic | null; label: string }> = [
  { id: null, label: "Всё" },
  { id: "start", label: "Первый запуск" },
  { id: "workouts", label: "Тренировки" },
  { id: "nutrition", label: "Питание" },
  { id: "progress", label: "Прогресс" },
  { id: "notifications", label: "Уведомления" },
];

type NavigationState = { returnTo?: unknown } | null;

function safeReturnTo(state: NavigationState): string {
  const value = state?.returnTo;
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/more";
}

function ArticleCard({ article, highlighted }: {
  article: FaqArticle;
  highlighted: boolean;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!highlighted || !detailsRef.current) return;
    detailsRef.current.open = true;
    const summary = detailsRef.current.querySelector("summary");
    summary?.focus({ preventScroll: true });
    detailsRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlighted]);

  return (
    <details
      id={`faq-${article.id}`}
      ref={detailsRef}
      className={`faq-article-card${highlighted ? " faq-article-highlighted" : ""}`}
    >
      <summary className="faq-article-summary">
        <span className="faq-article-heading">
          <span>{article.title}</span>
        </span>
        <span className="faq-article-description">
          {article.summary}
        </span>
      </summary>
      <ul className="faq-article-points">
        {article.points.map((point) => <li key={point}>{point}</li>)}
      </ul>
    </details>
  );
}

export function HelpFaqPage({ defaultTab = "howto" }: { defaultTab?: FaqTab }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedArticle = faqArticleById(FAQ_ARTICLES, searchParams.get("article"));
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<FaqTopic | null>(null);

  useEffect(() => {
    trackEvent("faq_opened", { source: "navigation" });
  }, []);

  const visibleArticles = useMemo(() => {
    return searchFaqArticles(FAQ_ARTICLES, query, topic);
  }, [query, topic]);
  const groups = useMemo(() => {
    const orderedTabs: FaqTab[] = defaultTab === "knowledge"
      ? ["knowledge", "howto"]
      : ["howto", "knowledge"];
    return orderedTabs.map((groupTab) => ({
      tab: groupTab,
      title: groupTab === "howto" ? "Как сделать" : "Знания",
      articles: visibleArticles.filter((article) => article.tab === groupTab),
    })).filter((group) => group.articles.length > 0);
  }, [defaultTab, visibleArticles]);

  function selectTopic(next: FaqTopic | null) {
    setTopic(next);
    setQuery("");
    setSearchParams({}, { replace: true });
  }

  return (
    <section className={["mx-auto max-w-3xl", defaultTab === "knowledge" ? "knowledge-page" : ""].join(" ")}>
      <Header
        title={defaultTab === "knowledge" ? "Питание без лишних правил" : "Помощь и FAQ"}
        subtitle={defaultTab === "knowledge" ? "Практический гид по рациону и прогрессу" : "Действия в приложении, тренировки и питание"}
      />

      <label className="faq-search">
        Поиск ответа
        <div className="faq-search-control">
          <svg viewBox="0 0 24 24" className="faq-search-icon" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSearchParams({}, { replace: true });
            }}
            placeholder="Например: вода, таблетки, перенести пятницу"
            className="faq-search-input"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} className="faq-search-clear">
              Очистить
            </button>
          ) : null}
        </div>
      </label>

      <div className="faq-topics" aria-label="Быстрые темы">
        {QUICK_TOPICS.map((item) => (
          <button
            key={item.id ?? "all"}
            type="button"
            aria-pressed={topic === item.id}
            onClick={() => selectTopic(item.id)}
            className={`faq-topic${topic === item.id ? " faq-topic-active" : ""}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex min-h-11 items-center justify-between gap-3 text-xs text-tg-hint" aria-live="polite">
          <span>{query.trim() ? "Найдено" : "Материалов"}: {visibleArticles.length}</span>
          {(query.trim() || topic) ? (
          <button
            type="button"
            className="min-h-11 px-2 text-tg-link"
            onClick={() => { setQuery(""); setTopic(null); }}
          >
            Показать все
          </button>
          ) : null}
      </div>

      <div id="faq-results" className="space-y-5">
        {groups.map((group) => (
          <section key={group.tab} aria-labelledby={`faq-group-${group.tab}`}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 id={`faq-group-${group.tab}`} className="text-sm font-semibold text-tg-text">{group.title}</h2>
              <span className="text-xs text-tg-hint">{group.articles.length}</span>
            </div>
            <div className="space-y-3">
              {group.articles.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  highlighted={requestedArticle?.id === article.id}
                />
              ))}
            </div>
          </section>
        ))}
        {!visibleArticles.length ? (
          <div className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">
            <p className="font-medium text-tg-text">Ответ не найден</p>
            <p className="mt-1">Попробуйте другое слово или опишите вопрос поддержке.</p>
          </div>
        ) : null}
      </div>

      {groups.some((group) => group.tab === "knowledge") ? (
        <details className="mt-3 rounded-2xl bg-tg-secondary p-4">
          <summary className="cursor-pointer text-sm font-semibold">Источники и исследования</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
            {FAQ_SOURCES.map((source) => (
              <li key={source.href}>
                <a className="text-tg-link underline" href={source.href} target="_blank" rel="noreferrer">{source.label}</a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="mt-4 rounded-2xl bg-tg-secondary p-4">
        <p className="text-sm font-semibold">Не нашли ответ?</p>
        <p className="mt-1 text-xs text-tg-hint">Опишите ситуацию — ответ появится внутри приложения.</p>
        <Link to="/support" className="mt-3 block min-h-11 rounded-xl bg-tg-button px-4 py-3 text-center text-sm font-semibold text-tg-button-text">
          Написать в поддержку
        </Link>
      </div>

      <button
        type="button"
        onClick={() => navigate(safeReturnTo(location.state as NavigationState))}
        className="mt-3 min-h-11 w-full rounded-xl bg-tg-secondary px-4 py-3 text-sm font-medium text-tg-text"
      >
        Вернуться в приложение
      </button>
    </section>
  );
}
