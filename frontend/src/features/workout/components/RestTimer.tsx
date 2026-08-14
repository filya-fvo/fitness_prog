import { useEffect, useRef, useState } from "react";

import { formatRestTime } from "@/utils/format";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";

type RestTimerProps = {
  secondsLeft: number;
  isResting: boolean;
  /** Initial/total duration for ring progress (optional). */
  totalSeconds?: number;
  onSkip: () => void;
  /** Adjust remaining rest time while timer runs (e.g. ±15 / ±30). */
  onAdjust?: (deltaSeconds: number) => void;
};

/**
 * Compact floating rest chip (default) + optional full-screen ring modal.
 * Avoids a heavy always-on modal that reflows the workout page every second.
 */
export function RestTimer({
  secondsLeft,
  isResting,
  totalSeconds,
  onSkip,
  onAdjust,
}: RestTimerProps) {
  const [expanded, setExpanded] = useState(false);
  const dialogRef = useModalAccessibility(expanded, () => setExpanded(false));
  const totalRef = useRef<number>(Math.max(1, totalSeconds || secondsLeft || 1));

  useEffect(() => {
    if (!isResting) {
      setExpanded(false);
      return;
    }
    // Capture span once when rest starts / grows (e.g. +30s).
    if (secondsLeft >= totalRef.current) {
      totalRef.current = Math.max(1, secondsLeft);
    }
    if (totalSeconds && totalSeconds > totalRef.current) {
      totalRef.current = totalSeconds;
    }
  }, [isResting, secondsLeft, totalSeconds]);

  if (!isResting) return null;

  const total = Math.max(1, totalRef.current);
  const progress = Math.max(0, Math.min(1, secondsLeft / total));
  const size = 56;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * progress;

  const bigSize = 220;
  const bigStroke = 14;
  const bigR = (bigSize - bigStroke) / 2;
  const bigC = 2 * Math.PI * bigR;
  const bigDash = bigC * progress;

  const reduceMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <>
      {/* Compact chip — bottom-left, does not block the page */}
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="fixed bottom-24 left-3 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#1a1a1e]/95 shadow-lg ring-1 ring-white/10 backdrop-blur"
          aria-label={`Отдых ${formatRestTime(secondsLeft)}. Открыть таймер`}
        >
          <svg width={size} height={size} className={reduceMotion ? "" : "-rotate-90"}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="#b8f56e"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={reduceMotion ? undefined : `${dash} ${c}`}
              opacity={reduceMotion ? 0.35 : 1}
            />
          </svg>
          <span className="absolute text-[11px] font-semibold tabular-nums text-white">
            {formatRestTime(secondsLeft)}
          </span>
        </button>
      ) : null}

      {/* Full modal — only when user opens the chip */}
      {expanded ? (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="rest-timer-title"
          tabIndex={-1}
          className="fixed inset-0 z-50 flex flex-col bg-[#121214] text-white"
        >
          <div className="flex items-center justify-between px-4 py-3">
            <p id="rest-timer-title" className="text-sm font-medium text-white/80">Таймер отдыха</p>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="rounded-lg px-2 py-1 text-xl leading-none text-white/70"
              aria-label="Свернуть"
            >
              ⌄
            </button>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
            <div className="relative flex items-center justify-center">
              <svg width={bigSize} height={bigSize} className={reduceMotion ? "" : "-rotate-90"}>
                <circle
                  cx={bigSize / 2}
                  cy={bigSize / 2}
                  r={bigR}
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth={bigStroke}
                />
                <circle
                  cx={bigSize / 2}
                  cy={bigSize / 2}
                  r={bigR}
                  fill="none"
                  stroke="#b8f56e"
                  strokeWidth={bigStroke}
                  strokeLinecap="round"
                  strokeDasharray={reduceMotion ? undefined : `${bigDash} ${bigC}`}
                  opacity={reduceMotion ? 0.4 : 1}
                />
              </svg>
              <p className="absolute text-5xl font-semibold tabular-nums tracking-tight">
                {formatRestTime(secondsLeft)}
              </p>
            </div>
          </div>

          <div className="safe-pb grid grid-cols-3 gap-3 px-4 pb-6 pt-2">
            <button
              type="button"
              onClick={() => onAdjust?.(-15)}
              disabled={!onAdjust}
              className="rounded-full bg-white/10 py-3 text-sm font-semibold disabled:opacity-40"
            >
              − 15 сек
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="rounded-full bg-white py-3 text-sm font-semibold text-black"
            >
              Стоп
            </button>
            <button
              type="button"
              onClick={() => onAdjust?.(15)}
              disabled={!onAdjust}
              className="rounded-full bg-white/10 py-3 text-sm font-semibold disabled:opacity-40"
            >
              + 15 сек
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
