import { memo, useEffect, useState } from "react";

import { formatElapsed } from "@/utils/format";

type Props = {
  /** ISO started_at of the workout session. */
  startedAt: string | null | undefined;
  /** Freeze display (summary / completed). */
  frozenSec?: number | null;
  /** Stop ticking. */
  paused?: boolean;
  className?: string;
  /** Optional prefix label above the clock. */
  label?: string;
};

/**
 * Owns its own 1s interval so parent workout page does not re-render every second.
 */
export const WorkoutElapsedClock = memo(function WorkoutElapsedClock({
  startedAt,
  frozenSec = null,
  paused = false,
  className = "text-2xl font-semibold tabular-nums leading-none",
  label,
}: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (paused || frozenSec != null) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [paused, frozenSec, startedAt]);

  const sec = (() => {
    if (frozenSec != null) return Math.max(0, frozenSec);
    if (!startedAt) return 0;
    const t = Date.parse(startedAt);
    if (!Number.isFinite(t)) return 0;
    return Math.max(0, Math.floor((nowMs - t) / 1000));
  })();

  return (
    <div>
      {label ? <p className="text-[10px] uppercase tracking-wide text-tg-hint">{label}</p> : null}
      <p className={className}>{formatElapsed(sec)}</p>
    </div>
  );
});
