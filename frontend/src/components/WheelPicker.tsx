import { useCallback, useEffect, useMemo, useRef } from "react";

type Props = {
  label: string;
  value: number;
  options: number[];
  onChange: (next: number) => void;
  format?: (n: number) => string;
  className?: string;
};

/**
 * Smooth scroll-snap wheel (mobile-friendly). Used for reps / kg / min / sec.
 * - rAF-throttled scroll handler (less jank than onChange every scroll event)
 * - settle/snap on scroll end
 * - avoids fighting the user by only auto-scrolling when value changes externally
 */
export function WheelPicker({
  label,
  value,
  options,
  onChange,
  format = (n) => String(n),
  className = "",
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const itemH = 40;
  const dragging = useRef(false);
  const lastEmitted = useRef(value);
  const raf = useRef<number | null>(null);
  const settleTimer = useRef<number | null>(null);
  const programmatic = useRef(false);

  const uniq = useMemo(() => {
    const s = [...new Set(options)].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
    return s.length ? s : [0];
  }, [options]);

  const indexOf = useCallback(
    (v: number) => {
      const i = uniq.indexOf(v);
      return i >= 0 ? i : 0;
    },
    [uniq],
  );

  const scrollToIndex = useCallback(
    (idx: number, smooth: boolean) => {
      const el = ref.current;
      if (!el) return;
      const top = Math.max(0, idx) * itemH;
      programmatic.current = true;
      if (smooth && typeof el.scrollTo === "function") {
        el.scrollTo({ top, behavior: "smooth" });
      } else {
        el.scrollTop = top;
      }
      window.setTimeout(() => {
        programmatic.current = false;
      }, smooth ? 280 : 40);
    },
    [itemH],
  );

  // External value sync (open modal / preset) — only when not dragging
  useEffect(() => {
    if (dragging.current) return;
    const el = ref.current;
    if (!el) return;
    const idx = indexOf(value);
    const target = idx * itemH;
    if (Math.abs(el.scrollTop - target) > itemH * 0.35) {
      scrollToIndex(idx, false);
    }
    lastEmitted.current = value;
  }, [indexOf, itemH, scrollToIndex, value, uniq]);

  function emitFromScroll() {
    const el = ref.current;
    if (!el || programmatic.current) return;
    const idx = Math.round(el.scrollTop / itemH);
    const clamped = Math.max(0, Math.min(uniq.length - 1, idx));
    const next = uniq[clamped] ?? value;
    if (next !== lastEmitted.current) {
      lastEmitted.current = next;
      onChange(next);
    }
  }

  function onScroll() {
    if (programmatic.current) return;
    dragging.current = true;
    if (raf.current != null) return;
    raf.current = window.requestAnimationFrame(() => {
      raf.current = null;
      emitFromScroll();
    });
    if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / itemH);
      const clamped = Math.max(0, Math.min(uniq.length - 1, idx));
      scrollToIndex(clamped, true);
      const next = uniq[clamped] ?? value;
      if (next !== lastEmitted.current) {
        lastEmitted.current = next;
        onChange(next);
      }
      dragging.current = false;
    }, 90) as unknown as number;
  }

  useEffect(() => {
    return () => {
      if (raf.current != null) window.cancelAnimationFrame(raf.current);
      if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
    };
  }, []);

  return (
    <label className={`block min-w-0 flex-1 text-center text-[11px] text-tg-hint ${className}`}>
      {label}
      <div className="relative mt-1 h-[200px] overflow-hidden rounded-xl bg-black/20">
        <div className="pointer-events-none absolute inset-x-2 top-1/2 z-10 h-10 -translate-y-1/2 rounded-lg border border-white/25" />
        <div
          ref={ref}
          onScroll={onScroll}
          className="h-full touch-pan-y snap-y snap-mandatory overflow-y-auto overscroll-contain py-20 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{
            scrollSnapType: "y mandatory",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {uniq.map((n) => (
            <div
              key={n}
              className={[
                "flex h-10 snap-center items-center justify-center text-lg tabular-nums transition-colors duration-150",
                n === value ? "font-semibold text-white" : "text-white/40",
              ].join(" ")}
              style={{ scrollSnapAlign: "center" }}
            >
              {format(n)}
            </div>
          ))}
        </div>
      </div>
    </label>
  );
}
