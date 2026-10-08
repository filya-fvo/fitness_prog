import { Link } from "react-router-dom";

export function LegalLinks() {
  return <nav aria-label="Документы FilFit" className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-tg-hint">
    <Link to="/legal/privacy" className="inline-flex min-h-11 items-center underline underline-offset-4">Политика</Link>
    <Link to="/legal/consent" className="inline-flex min-h-11 items-center underline underline-offset-4">Согласие</Link>
    <Link to="/legal/offer" className="inline-flex min-h-11 items-center underline underline-offset-4">Оферта</Link>
  </nav>;
}
