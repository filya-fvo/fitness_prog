import { useCallback, useEffect, useRef, useState } from "react";

import type { CycleReadiness } from "@/utils/cycleTraining";

type ReadinessResult = CycleReadiness | undefined | null;

export function usePreWorkoutReadiness(enabled: boolean) {
  const [open, setOpen] = useState(false);
  const resolverRef = useRef<((value: ReadinessResult) => void) | null>(null);
  const pendingPromiseRef = useRef<Promise<ReadinessResult> | null>(null);

  const finish = useCallback((value: ReadinessResult) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    pendingPromiseRef.current = null;
    setOpen(false);
    resolve?.(value);
  }, []);

  const requestReadiness = useCallback((): Promise<ReadinessResult> => {
    if (!enabled) return Promise.resolve(undefined);
    // A rapid second click must not create a second caller that continues after
    // the same answer and starts a duplicate local session.
    if (pendingPromiseRef.current) return Promise.resolve(null);

    const pending = new Promise<ReadinessResult>((resolve) => {
      resolverRef.current = resolve;
      setOpen(true);
    });
    pendingPromiseRef.current = pending;
    return pending;
  }, [enabled]);

  useEffect(() => {
    if (!enabled && resolverRef.current) finish(null);
  }, [enabled, finish]);

  useEffect(() => () => {
    resolverRef.current?.(null);
    resolverRef.current = null;
    pendingPromiseRef.current = null;
  }, []);

  return {
    open,
    requestReadiness,
    chooseReadiness: (value: CycleReadiness) => finish(value),
    cancelReadiness: () => finish(null),
  };
}
