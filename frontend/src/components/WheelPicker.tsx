import { useEffect, useMemo, useRef } from "react";

type Props = {
  label: string;
  value: number;
  options: number[];
  onChange: (next: number) => void;
  format?: (n: number) => string;
  className?: string;
};

/**
 * Simple scroll-snap wheel (mobile-friendly). Used for reps / kg / min / sec.
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
  const itemH = 36;
  const uniq = useMemo(() => {
    const s = [...new Set(options)].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
    return s.length ? s : [0];
  }, [options]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, uniq.indexOf(value));
    const top = idx * itemH;
    if (Math.abs(el.scrollTop - top) > 2) {
      el.scrollTop = top;
    }
  }, [uniq, value]);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / itemH);
    const clamped = Math.max(0, Math.min(uniq.length - 1, idx));
    const next = uniq[clamped] ?? value;
    if (next !== value) onChange(next);
  }

  return (
    <label className={`block min-w-0 flex-1 text-center text-[11px] text-tg-hint ${className}`}>
      {label}
      <div className="relative mt-1 h-[180px] overflow-hidden rounded-xl bg-black/20">
        <div className="pointer-events-none absolute inset-x-2 top-1/2 z-10 h-9 -translate-y-1/2 rounded-lg border border-white/25" />
        <div
          ref={ref}
          onScroll={onScroll}
          className="h-full snap-y snap-mandatory overflow-y-auto scroll-smooth py-[72px] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {uniq.map((n) => (
            <div
              key={n}
              className={[
                "flex h-9 snap-center items-center justify-center text-lg tabular-nums",
                n === value ? "font-semibold text-tg-text" : "text-tg-hint/70",
              ].join(" ")}
            >
              {format(n)}
            </div>
          ))}
        </div>
      </div>
    </label>
  );
}

export function rangeInts(from: number, to: number, step = 1): number[] {
  const out: number[] = [];
  for (let n = from; n <= to; n += step) out.push(n);
  return out;
}
