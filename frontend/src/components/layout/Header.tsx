import { useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { fallbackPathFor, shouldShowPageBack } from "@/lib/appNavigation";
import { getTelegramWebApp } from "@/lib/telegram";

type HeaderProps = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  fallbackTo?: string;
};

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span className="brand-letter">F</span>
    </span>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m14.5 5-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 12h10" strokeLinecap="round" />
    </svg>
  );
}

export function Header({ title, subtitle, showBack, fallbackTo }: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const backVisible = showBack ?? shouldShowPageBack(location.pathname);

  const goBack = useCallback(() => {
    const historyIndex = Number(window.history.state?.idx ?? 0);
    if (historyIndex > 0) {
      navigate(-1);
      return;
    }
    navigate(fallbackTo ?? fallbackPathFor(location.pathname), { replace: true });
  }, [fallbackTo, location.pathname, navigate]);

  useEffect(() => {
    const backButton = getTelegramWebApp()?.BackButton;
    if (!backButton) return;
    if (!backVisible) {
      backButton.hide();
      return;
    }
    backButton.show();
    backButton.onClick(goBack);
    return () => {
      backButton.offClick(goBack);
      backButton.hide();
    };
  }, [backVisible, goBack]);

  return (
    <header className="app-page-header mb-5">
      <div className="flex min-w-0 items-center gap-3">
        {backVisible ? (
          <button
            type="button"
            onClick={goBack}
            className="app-back-button tap-target shrink-0"
            aria-label="Вернуться назад"
          >
            <BackIcon />
          </button>
        ) : (
          <BrandMark />
        )}
        <div className="min-w-0">
          <h1 className="truncate text-[1.35rem] font-semibold tracking-[-0.02em] text-tg-text">{title}</h1>
          {subtitle ? <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-tg-hint">{subtitle}</p> : null}
        </div>
      </div>
    </header>
  );
}
