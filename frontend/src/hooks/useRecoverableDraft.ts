import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Options<T> = {
  owner: string | null | undefined;
  context: string;
  ready: boolean;
  value: T;
  restore: (value: T) => void;
  validate?: (value: T) => boolean;
};

function compatible(template: unknown, candidate: unknown): boolean {
  if (template === undefined) return candidate === undefined || candidate === null || typeof candidate === "string" || Array.isArray(candidate);
  if (Array.isArray(template)) return Array.isArray(candidate) && candidate.length <= 128
    && candidate.every((item) => template.length ? compatible(template[0], item) : item !== null && typeof item === "object");
  if (template && typeof template === "object") return Boolean(candidate) && typeof candidate === "object" && !Array.isArray(candidate)
    && Object.entries(template).every(([key, entry]) => compatible(entry, (candidate as Record<string, unknown>)[key]));
  return typeof template === typeof candidate;
}

/** Account-scoped recovery; only explicitly selected, non-secret form fields belong here. */
export function useRecoverableDraft<T>({ owner, context, ready, value, restore, validate }: Options<T>) {
  const key = owner ? `fitness_form_draft:v1:${owner}:${context}` : null;
  const serialized = JSON.stringify(value);
  const current = useRef({ key: null as string | null, baseline: serialized });
  const wasReady = useRef(false);
  const hasChanges = useRef(false);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const valueRef = useRef(value);
  valueRef.current = value;
  const validateRef = useRef(validate);
  validateRef.current = validate;
  const [dirty, setDirty] = useState(false);
  const [available, setAvailable] = useState(true);

  useLayoutEffect(() => {
    const refreshed = ready && !wasReady.current;
    wasReady.current = ready;
    if (!key || !ready) return;
    try {
      if (current.current.key !== key) {
        current.current = { key, baseline: serialized };
        hasChanges.current = false;
        setDirty(false);
        const saved = localStorage.getItem(key);
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (saved.length <= 100_000 && compatible(valueRef.current, parsed) && (!validateRef.current || validateRef.current(parsed as T))) {
            if (JSON.stringify(parsed) !== serialized) {
              hasChanges.current = true;
              restoreRef.current(parsed as T);
              return;
            }
          }
          localStorage.removeItem(key);
        }
      } else if (refreshed && !hasChanges.current) {
        current.current.baseline = serialized;
      }
      const changed = serialized !== current.current.baseline;
      hasChanges.current = changed;
      if (changed) localStorage.setItem(key, serialized);
      else localStorage.removeItem(key);
      setAvailable(true);
      setDirty(changed);
    } catch {
      // Restricted storage must not make the form unusable.
      setAvailable(false);
      hasChanges.current = serialized !== current.current.baseline;
      setDirty(serialized !== current.current.baseline);
    }
  }, [key, ready, serialized]);

  useEffect(() => {
    if (available || !dirty) return;
    const preventExit = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventExit);
    return () => window.removeEventListener("beforeunload", preventExit);
  }, [available, dirty]);

  function clear(next: T = value, retained: T = next) {
    // An exited form may finish saving after a new instance writes a newer draft.
    // Only replace the exact submitted snapshot, never another instance's edits.
    const baseline = JSON.stringify(next);
    const pending = JSON.stringify(retained);
    const changed = pending !== baseline;
    if (current.current.key !== key) return;
    if (key) {
      try {
        const stored = localStorage.getItem(key);
        if (stored !== null && stored !== serialized) return;
        if (changed) localStorage.setItem(key, pending);
        else localStorage.removeItem(key);
      } catch { /* Restricted storage must not prevent an accepted save. */ }
    }
    current.current = { key, baseline };
    hasChanges.current = changed;
    setDirty(changed);
  }

  function discard() {
    restoreRef.current(JSON.parse(current.current.baseline) as T);
    clear(JSON.parse(current.current.baseline) as T);
  }

  return { dirty, available, hasChanges, clear, discard };
}
