import { useCallback, useEffect, useId, useMemo, useRef, type KeyboardEvent } from "react";
import { prefersReducedMotion } from "@/utils/motion";

type Props = {
  label: string;
  value: number;
  options: number[];
  onChange: (next: number) => void;
  format?: (n: number) => string;
  className?: string;
};

/** Controlled scroll-snap wheel with keyboard and a native selection alternative. */
export function WheelPicker({ label, value, options, onChange, format = String, className = "" }: Props) {
  const id = useId();
  const ref = useRef<HTMLDivElement | null>(null);
  const itemH = 44;
  const dragging = useRef(false);
  const lastEmitted = useRef(value);
  const raf = useRef<number | null>(null);
  const settleTimer = useRef<number | null>(null);
  const releaseTimer = useRef<number | null>(null);
  const programmatic = useRef(false);

  const uniq = useMemo(() => {
    // Retain saved/preset values even when the current catalog has a narrower range.
    const values = [...new Set([...options, value])].filter(Number.isFinite).sort((a, b) => a - b);
    return values.length ? values : [0];
  }, [options, value]);
  const indexOf = useCallback((next: number) => Math.max(0, uniq.indexOf(next)), [uniq]);

  const scrollToIndex = useCallback((idx: number, smooth: boolean) => {
    const el = ref.current;
    if (!el) return;
    const animate = smooth && !prefersReducedMotion();
    programmatic.current = true;
    if (releaseTimer.current != null) window.clearTimeout(releaseTimer.current);
    el.scrollTo({ top: idx * itemH, behavior: animate ? "smooth" : "instant" });
    releaseTimer.current = window.setTimeout(() => { programmatic.current = false; }, animate ? 280 : 40);
  }, []);

  useEffect(() => {
    // Scroll-originated renders should not fight a finger; external presets must win.
    if (!dragging.current || value !== lastEmitted.current) {
      dragging.current = false;
      if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
      const idx = indexOf(value);
      if (ref.current && Math.abs(ref.current.scrollTop - idx * itemH) > itemH * 0.35) {
        scrollToIndex(idx, false);
      }
    }
    lastEmitted.current = value;
  }, [indexOf, scrollToIndex, value]);

  function emit(next: number) {
    if (next !== lastEmitted.current) {
      lastEmitted.current = next;
      onChange(next);
    }
  }

  function choose(idx: number) {
    const clamped = Math.max(0, Math.min(uniq.length - 1, idx));
    dragging.current = false;
    if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
    scrollToIndex(clamped, false);
    emit(uniq[clamped]);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const idx = indexOf(lastEmitted.current);
    const next = { ArrowDown: idx + 1, ArrowUp: idx - 1, Home: 0, End: uniq.length - 1,
      PageDown: idx + 5, PageUp: idx - 5 }[event.key];
    if (next == null) return;
    event.preventDefault();
    choose(next);
  }

  function onScroll() {
    if (programmatic.current) return;
    dragging.current = true;
    if (raf.current == null) {
      raf.current = window.requestAnimationFrame(() => {
        raf.current = null;
        if (!ref.current || programmatic.current) return;
        const idx = Math.max(0, Math.min(uniq.length - 1, Math.round(ref.current.scrollTop / itemH)));
        emit(uniq[idx]);
      });
    }
    if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      if (!ref.current) return;
      const idx = Math.max(0, Math.min(uniq.length - 1, Math.round(ref.current.scrollTop / itemH)));
      emit(uniq[idx]);
      dragging.current = false;
      scrollToIndex(idx, true);
    }, 90);
  }

  useEffect(() => () => {
    if (raf.current != null) window.cancelAnimationFrame(raf.current);
    if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
    if (releaseTimer.current != null) window.clearTimeout(releaseTimer.current);
  }, []);

  return (
    <div className={`block min-w-0 flex-1 text-center text-[11px] text-tg-hint ${className}`}>
      <span id={`${id}-label`}>{label}</span>
      <div className="relative mt-1 h-[220px] overflow-hidden rounded-xl bg-tg-secondary">
        <div className="pointer-events-none absolute inset-x-2 top-1/2 z-10 h-11 -translate-y-1/2 rounded-lg border border-[var(--border-subtle)]" />
        <div ref={ref} role="listbox" tabIndex={0} aria-labelledby={`${id}-label`}
          aria-activedescendant={`${id}-option-${indexOf(value)}`}
          onKeyDown={onKeyDown} onScroll={onScroll}
          onPointerDown={() => { programmatic.current = false; }}
          onWheel={() => { programmatic.current = false; }}
          className="h-full touch-pan-y snap-y snap-mandatory overflow-y-auto overscroll-contain py-[88px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-tg-button [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ scrollSnapType: "y mandatory", WebkitOverflowScrolling: "touch" }}>
          {uniq.map((n, idx) => (
            <div key={n} id={`${id}-option-${idx}`} role="option" aria-selected={n === value}
              onClick={() => { ref.current?.focus({ preventScroll: true }); choose(idx); }}
              className={`flex h-11 min-w-11 snap-center cursor-pointer items-center justify-center text-lg tabular-nums transition-colors duration-150 motion-reduce:transition-none ${n === value ? "font-semibold text-tg-text" : "text-tg-hint"}`}
              style={{ scrollSnapAlign: "center" }}>{format(n)}</div>
          ))}
        </div>
      </div>
      <select aria-label={`${label}: выбрать значение`} value={uniq[indexOf(value)]}
        onChange={(event) => choose(indexOf(Number(event.target.value)))}
        className="app-field mt-2 min-h-11 w-full text-base">
        {uniq.map((n) => <option key={n} value={n}>{format(n)}</option>)}
      </select>
    </div>
  );
}
