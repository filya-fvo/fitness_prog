/** Network helpers for offline-first flows. */

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}
