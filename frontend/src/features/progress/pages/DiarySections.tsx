import type { ReactNode } from "react";

type Props = { overview: ReactNode; analytics: ReactNode; showAnalytics: boolean };

export function DiarySections({ overview, analytics, showAnalytics }: Props) {
  return (
    <div className="space-y-5">
      <section aria-label="Обзор">{overview}</section>
      {showAnalytics ? <section aria-label="Подробная аналитика" className="border-t border-[var(--border-subtle)] pt-4">{analytics}</section> : null}
    </div>
  );
}
