import { useEffect } from "react";
import { Link } from "react-router-dom";

import { trackEvent } from "@/lib/analytics";

export function PlusAccessSummary({
  feature,
  title = "Подробный прогресс доступен в PLUS",
  compact = false,
}: {
  feature: string;
  title?: string;
  compact?: boolean;
}) {
  useEffect(() => {
    trackEvent("plus_gate_viewed", { feature });
  }, [feature]);

  return (
    <section className={`rounded-2xl bg-tg-secondary ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{title}</p>
        <span className="shrink-0 rounded-full bg-tg-button/15 px-2.5 py-1 text-xs font-semibold text-tg-link">PLUS</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-tg-hint">
        В PLUS доступны история тренировок и подходов, динамика замеров, силовые тренды и подробные отчёты.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          to="/faq?article=plus"
          className="inline-flex min-h-11 items-center rounded-xl bg-tg-bg px-3 text-xs font-semibold text-tg-link"
        >
          Что входит в PLUS
        </Link>
        <Link to="/" className="inline-flex min-h-11 items-center rounded-xl px-3 text-xs text-tg-link">
          К тренировке
        </Link>
      </div>
    </section>
  );
}
