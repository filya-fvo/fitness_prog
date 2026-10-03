import { useEffect, useRef } from "react";
import { preferredScrollBehavior } from "@/utils/motion";

import type { FaqArticle } from "./faqContent";
import { FaqIllustration } from "./FaqIllustration";
import { FAQ_TONES } from "./faqVisuals";

export function FaqArticleCard({ article, highlighted }: {
  article: FaqArticle;
  highlighted: boolean;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!highlighted || !detailsRef.current) return;
    detailsRef.current.open = true;
    detailsRef.current.querySelector("summary")?.focus({ preventScroll: true });
    detailsRef.current.scrollIntoView({ behavior: preferredScrollBehavior(), block: "center" });
  }, [highlighted]);

  return (
    <details
      id={`faq-${article.id}`}
      ref={detailsRef}
      className={`app-card faq-article-card faq-tone-${FAQ_TONES[article.id] ?? "indigo"}${highlighted ? " faq-article-highlighted" : ""}`}
    >
      <summary className="faq-article-summary">
        <span className="faq-article-heading">
          <span>{article.title}</span>
          <span className="faq-article-art"><FaqIllustration articleId={article.id} /></span>
        </span>
        <span className="faq-article-description">{article.summary}</span>
        <span className="faq-article-disclosure" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>
      <ul className="faq-article-points">
        {article.points.map((point) => <li key={point}>{point}</li>)}
      </ul>
    </details>
  );
}
