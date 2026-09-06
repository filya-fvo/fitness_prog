import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
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

const TABS: Array<{ id: FaqTab; label: string }> = [
  { id: "howto", label: "Как сделать" },
  { id: "knowledge", label: "О тренировках и питании" },
];

const QUICK_TOPICS: Array<{ id: FaqTopic; label: string }> = [
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

function ArticleCard({ article, highlighted, showType }: {
  article: FaqArticle;
  highlighted: boolean;
  showType: boolean;
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
      className={[
        "scroll-mt-4 rounded-2xl bg-tg-secondary p-4",
        highlighted ? "ring-2 ring-tg-button/60" : "",
      ].join(" ")}
    >
      <summary className="cursor-pointer list-none pr-2 text-sm font-semibold marker:hidden">
        <span className="flex items-start justify-between gap-3">
          <span>{article.title}</span>
          {showType ? (
            <span className="shrink-0 rounded-full bg-tg-bg px-2 py-1 text-[10px] font-normal text-tg-hint">
              {article.tab === "howto" ? "Как сделать" : "Знания"}
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-xs font-normal leading-relaxed text-tg-hint">
          {article.summary}
        </span>
      </summary>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-tg-hint">
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
  const requestedTab = searchParams.get("tab");
  const initialTab = requestedArticle?.tab
    ?? (requestedTab === "knowledge" || requestedTab === "howto" ? requestedTab : defaultTab);
  const [tab, setTab] = useState<FaqTab>(initialTab);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<FaqTopic | null>(null);

  useEffect(() => {
    if (requestedArticle) setTab(requestedArticle.tab);
  }, [requestedArticle]);

  const filtering = Boolean(query.trim() || topic);
  const visibleArticles = useMemo(() => {
    if (filtering) return searchFaqArticles(FAQ_ARTICLES, query, topic);
    return FAQ_ARTICLES.filter((article) => article.tab === tab);
  }, [filtering, query, tab, topic]);

  function selectTab(next: FaqTab) {
    setTab(next);
    setTopic(null);
    setQuery("");
    const params = new URLSearchParams();
    if (location.pathname === "/faq") params.set("tab", next);
    setSearchParams(params, { replace: true });
  }

  function selectTopic(next: FaqTopic) {
    setTopic((current) => current === next ? null : next);
    setQuery("");
    setSearchParams({}, { replace: true });
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + direction + TABS.length) % TABS.length;
    const next = TABS[nextIndex];
    if (!next) return;
    selectTab(next.id);
    document.getElementById(`faq-tab-${next.id}`)?.focus();
  }

  return (
    <section className="mx-auto max-w-3xl">
      <Header title="Помощь и FAQ" subtitle="Действия в приложении, тренировки и питание" />

      <label className="block rounded-2xl bg-tg-secondary p-3 text-xs font-medium text-tg-hint">
        Поиск ответа
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-tg-bg px-3">
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setTopic(null);
              setSearchParams({}, { replace: true });
            }}
            placeholder="Например: вода, таблетки, перенести пятницу"
            className="min-h-12 w-full bg-transparent text-base text-tg-text outline-none placeholder:text-tg-hint"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} className="min-h-11 shrink-0 px-2 text-xs text-tg-link">
              Очистить
            </button>
          ) : null}
        </div>
      </label>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Быстрые темы">
        {QUICK_TOPICS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={topic === item.id}
            onClick={() => selectTopic(item.id)}
            className={[
              "min-h-11 shrink-0 rounded-full px-3 text-xs font-medium",
              topic === item.id ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary text-tg-text",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
      </div>

      {!filtering ? (
        <div className="mt-3 grid grid-cols-2 rounded-xl bg-tg-secondary p-1" role="tablist" aria-label="Разделы помощи">
          {TABS.map((item, index) => (
            <button
              key={item.id}
              id={`faq-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              aria-controls="faq-results"
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => selectTab(item.id)}
              onKeyDown={(event) => handleTabKey(event, index)}
              className={[
                "min-h-11 rounded-lg px-2 py-2 text-xs",
                tab === item.id ? "bg-tg-button font-semibold text-tg-button-text" : "text-tg-hint",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex min-h-11 items-center justify-between gap-3 text-xs text-tg-hint" aria-live="polite">
          <span>Найдено ответов: {visibleArticles.length}</span>
          <button
            type="button"
            className="min-h-11 px-2 text-tg-link"
            onClick={() => { setQuery(""); setTopic(null); }}
          >
            Показать все
          </button>
        </div>
      )}

      <div id="faq-results" role="tabpanel" aria-labelledby={!filtering ? `faq-tab-${tab}` : undefined} className="mt-3 space-y-3">
        {visibleArticles.map((article) => (
          <ArticleCard
            key={article.id}
            article={article}
            highlighted={requestedArticle?.id === article.id}
            showType={filtering}
          />
        ))}
        {!visibleArticles.length ? (
          <div className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">
            <p className="font-medium text-tg-text">Ответ не найден</p>
            <p className="mt-1">Попробуйте другое слово или опишите вопрос поддержке.</p>
          </div>
        ) : null}
      </div>

      {!filtering && tab === "knowledge" ? (
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
