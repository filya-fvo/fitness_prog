import { useSyncExternalStore } from "react";
import { getStoredToken } from "@/api/client";

function subscribe(listener: () => void) {
  const events = ["storage", "fitness:session-change", "fitness:native-change", "focus", "pageshow"];
  for (const event of events) window.addEventListener(event, listener);
  return () => { for (const event of events) window.removeEventListener(event, listener); };
}

/** Subscribe without copying credentials into a second application store. */
export function useStoredToken() {
  return useSyncExternalStore(subscribe, getStoredToken, () => null);
}
