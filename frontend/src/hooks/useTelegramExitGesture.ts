import { useEffect } from "react";

import { getTelegramWebApp, isTelegramEnvironment } from "@/lib/telegram";

const EDGE_WIDTH_PX = 28;
const MIN_HORIZONTAL_DISTANCE_PX = 72;
const MAX_VERTICAL_DISTANCE_PX = 48;
const HORIZONTAL_DOMINANCE = 1.5;

export type EdgeSwipe = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

export function isExitEdgeSwipe(swipe: EdgeSwipe): boolean {
  if (swipe.startX < 0 || swipe.startX > EDGE_WIDTH_PX) return false;
  const horizontalDistance = swipe.endX - swipe.startX;
  const verticalDistance = Math.abs(swipe.endY - swipe.startY);
  return (
    horizontalDistance >= MIN_HORIZONTAL_DISTANCE_PX &&
    verticalDistance <= MAX_VERTICAL_DISTANCE_PX &&
    horizontalDistance >= verticalDistance * HORIZONTAL_DOMINANCE
  );
}

/**
 * Telegram iOS does not expose its chat edge-back gesture to a Mini App.
 * Recreate that narrow edge gesture without intercepting normal scrolling or
 * horizontal controls. Android's OS Back remains native because BackButton is hidden.
 */
export function useTelegramExitGesture(): void {
  useEffect(() => {
    if (!isTelegramEnvironment()) return;
    const webApp = getTelegramWebApp();
    if (!webApp?.close) return;

    let start: { x: number; y: number; pointerId: number } | null = null;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || event.isPrimary === false || event.clientX > EDGE_WIDTH_PX) {
        return;
      }
      start = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    };
    const reset = () => {
      start = null;
    };
    const tryClose = (event: PointerEvent) => {
      const candidate = start;
      if (!candidate || candidate.pointerId !== event.pointerId) return;
      if (
        isExitEdgeSwipe({
          startX: candidate.x,
          startY: candidate.y,
          endX: event.clientX,
          endY: event.clientY,
        })
      ) {
        reset();
        webApp.close?.();
      }
    };
    const handlePointerUp = (event: PointerEvent) => {
      tryClose(event);
      reset();
    };

    document.addEventListener("pointerdown", handlePointerDown, { capture: true, passive: true });
    document.addEventListener("pointermove", tryClose, { capture: true, passive: true });
    document.addEventListener("pointerup", handlePointerUp, { capture: true, passive: true });
    document.addEventListener("pointercancel", reset, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("pointermove", tryClose, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("pointercancel", reset, true);
    };
  }, []);
}
