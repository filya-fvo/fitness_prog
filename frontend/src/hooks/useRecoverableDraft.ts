import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Options<T> = {
  owner: string | null | undefined;
  context: string;
  ready: boolean;
  value: T;
  restore: (value: T) => void;
  validate?: (value: T) => boolean;
  migrate?: (value: unknown) => unknown;
  /** Finite caller budget. Other forms retain the 100,000 character default. */
  maxChars?: number;
  /** Scoped domain shape parser, independent of the current object's optional keys. */
  parse?: (value: unknown) => T | null;
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
export function useRecoverableDraft<T>({ owner, context, ready, value, restore, validate, migrate, maxChars = 100_000, parse }: Options<T>) {
  const budget = Number.isSafeInteger(maxChars) && maxChars > 0 ? maxChars : 100_000;
  const key = owner ? `fitness_form_draft:v1:${owner}:${context}` : null;
  const serialized = JSON.stringify(value);
  const current = useRef({ key: null as string | null, baseline: serialized, owned: null as string | null, protected: null as string | null });
  const wasReady = useRef(false);
  const hasChanges = useRef(false);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const valueRef = useRef(value);
  valueRef.current = value;
  const migrateRef = useRef(migrate);
  migrateRef.current = migrate;
  const validateRef = useRef(validate);
  validateRef.current = validate;
  const parseRef = useRef(parse);
  parseRef.current = parse;
  const [dirty, setDirty] = useState(false);
  const [available, setAvailable] = useState(true);

  useLayoutEffect(() => {
    const refreshed = ready && !wasReady.current;
    wasReady.current = ready;
    if (!key || !ready) return;
    try {
      if (current.current.key !== key) {
        current.current = { key, baseline: serialized, owned: null, protected: null };
        hasChanges.current = false;
        setDirty(false);
        const decode = (saved: string | null): T | null => {
          if (!saved || saved.length > budget) return null;
          let parsed: unknown = null;
          try {
            const raw: unknown = JSON.parse(saved);
            const migrated = migrateRef.current ? migrateRef.current(raw) : raw;
            parsed = parseRef.current ? parseRef.current(migrated) : migrated;
          } catch { /* Malformed data is discarded without disabling usable storage. */ }
          return parsed !== null && (parseRef.current || compatible(valueRef.current, parsed)) && (!validateRef.current || validateRef.current(parsed as T)) ? parsed as T : null;
        };
        const saved = localStorage.getItem(key);
        if (saved) {
          const parsed = decode(saved);
          if (parsed !== null) {
            current.current.owned = saved;
            if (JSON.stringify(parsed) !== serialized) {
              hasChanges.current = true;
              restoreRef.current(parsed as T);
              return;
            }
          }
          localStorage.removeItem(key);
          current.current.owned = null;
        }
      } else if (refreshed && !hasChanges.current) {
        current.current.baseline = serialized;
      }
      const changed = serialized !== current.current.baseline;
      hasChanges.current = changed;
      // clear(next, retained) can race a newer instance. Keep its write intact
      // while the unchanged retained snapshot remains only in this form's memory.
      if (current.current.protected === serialized) {
        setAvailable(!changed);
        setDirty(changed);
        return;
      }
      current.current.protected = null;
      if (changed) {
        if (serialized.length > budget || (parseRef.current && parseRef.current(valueRef.current) === null)) throw new Error("Draft exceeds recovery limits");
        localStorage.setItem(key, serialized);
        current.current.owned = serialized;
      } else {
        localStorage.removeItem(key);
        current.current.owned = null;
      }
      setAvailable(true);
      setDirty(changed);
    } catch {
      // Restricted storage must not make the form unusable.
      setAvailable(false);
      hasChanges.current = serialized !== current.current.baseline;
      setDirty(serialized !== current.current.baseline);
    }
  }, [key, ready, serialized, budget]);

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
    // A save callback can also outlive newer typing in this same instance.
    // An explicitly supplied retained snapshot remains the caller's decision.
    const latest = JSON.stringify(valueRef.current);
    const pendingValue = arguments.length < 2 && latest !== serialized ? valueRef.current : retained;
    const pending = JSON.stringify(pendingValue);
    const changed = pending !== baseline;
    if (current.current.key !== key) return;
    let storedSuccessfully = !changed || (pending.length <= budget && (!parseRef.current || parseRef.current(pendingValue) !== null));
    if (key) {
      try {
        const stored = localStorage.getItem(key);
        if (stored === null || stored === current.current.owned) {
          current.current.protected = null;
          if (changed && storedSuccessfully) {
            localStorage.setItem(key, pending);
            current.current.owned = pending;
          } else {
            localStorage.removeItem(key);
            current.current.owned = null;
          }
        } else {
          current.current.protected = pending;
          storedSuccessfully = !changed;
        }
      } catch { storedSuccessfully = false; }
    }
    current.current.baseline = baseline;
    hasChanges.current = changed;
    setDirty(changed);
    setAvailable(storedSuccessfully);
  }

  function discard() {
    restoreRef.current(JSON.parse(current.current.baseline) as T);
    clear(JSON.parse(current.current.baseline) as T);
  }

  return { dirty, available, hasChanges, clear, discard };
}
