import illustrations from "./faqIllustrations.svg?url";
import { FAQ_TONES } from "./faqVisuals";

export function FaqIllustration({ articleId }: { articleId: string }) {
  if (!FAQ_TONES[articleId]) return null;
  return (
    <svg className="faq-illustration" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path className="faq-illustration-halo" d="M18 30Q34 2 66 14T91 54Q93 86 55 91T10 63Q5 44 18 30Z" />
      <ellipse className="faq-illustration-shadow" cx="51" cy="88" rx="32" ry="4" />
      <use className="faq-illustration-scene" href={`${illustrations}#${articleId}`} />
    </svg>
  );
}
