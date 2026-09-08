import { useEffect, useState } from "react";

import type { AuthUser } from "@/api/auth";
import { hasPlus } from "@/features/subscription/subscriptionAccess";
import { trackEvent } from "@/lib/analytics";

const NOTICE_VERSION = "beta-plus-2026-09";

function storageKey(userId: string): string {
  return `fitness_notice:${NOTICE_VERSION}:${userId}`;
}

export function BetaPlusNotice({ user }: { user: AuthUser }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hasPlus(user)) return;
    try {
      if (localStorage.getItem(storageKey(user.id))) return;
    } catch {
      // Private browser mode: show the useful notice for this session.
    }
    setVisible(true);
    trackEvent("beta_plus_notice_seen");
  }, [user]);

  if (!visible) return null;
  return (
    <aside role="status" className="mb-4 rounded-2xl border border-tg-button/25 bg-tg-secondary p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">PLUS открыт бесплатно</p>
          <p className="mt-1 text-xs leading-relaxed text-tg-hint">
            Мы открыли вам PLUS бесплатно на время развития приложения. В него входят история тренировок и подходов, динамика замеров и подробная аналитика. Перед переходом на платную модель мы предупредим заранее.
          </p>
        </div>
        <button
          type="button"
          aria-label="Закрыть сообщение о PLUS"
          onClick={() => {
            try { localStorage.setItem(storageKey(user.id), "dismissed"); } catch { /* noop */ }
            setVisible(false);
            trackEvent("beta_plus_notice_dismissed");
          }}
          className="tap-target -mr-2 -mt-2 shrink-0 rounded-xl text-lg text-tg-hint"
        >
          ×
        </button>
      </div>
    </aside>
  );
}
