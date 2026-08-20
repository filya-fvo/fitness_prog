import { useEffect, useRef, useState, type ReactNode } from "react";

type CollapsibleFilterPanelProps = {
  children: ReactNode;
  activeCount?: number;
  summary?: string;
  className?: string;
  defaultExpanded?: boolean;
};

export function CollapsibleFilterPanel({
  children,
  activeCount = 0,
  summary,
  className = "",
  defaultExpanded = true,
}: CollapsibleFilterPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const openedAtScrollRef = useRef(0);
  const manuallyOpenedRef = useRef(false);

  useEffect(() => {
    if (!expanded) return;
    openedAtScrollRef.current = window.scrollY;

    function onScroll() {
      if (manuallyOpenedRef.current) return;
      if (window.scrollY - openedAtScrollRef.current > 100) setExpanded(false);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [expanded]);

  function toggle() {
    setExpanded((current) => {
      const next = !current;
      manuallyOpenedRef.current = next;
      return next;
    });
  }

  return (
    <div className={`sticky top-0 z-10 -mx-1 mb-3 rounded-2xl bg-tg-bg/95 p-1 shadow-sm backdrop-blur ${className}`}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold">
            Фильтры{activeCount > 0 ? ` · ${activeCount}` : ""}
          </span>
          {!expanded && summary ? (
            <span className="block truncate text-[11px] text-tg-hint">{summary}</span>
          ) : null}
        </span>
        <span className="shrink-0 text-xs text-tg-link">{expanded ? "Свернуть" : "Изменить"}</span>
      </button>
      {expanded ? <div className="px-2 pb-2">{children}</div> : null}
    </div>
  );
}
