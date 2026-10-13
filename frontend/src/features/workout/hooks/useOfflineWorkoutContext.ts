import { useEffect, useState } from "react";
import { getStoredToken } from "@/api/client";
import { canPrepareOfflineWorkoutContext, prepareOfflineWorkoutContext, readOfflineWorkoutContext, type OfflineWorkoutContext } from "@/db/offlineWorkoutContext";
import { isOnline } from "@/utils/network";
import { toUserMessage } from "@/utils/errors";

export function useOfflineWorkoutContext(owner: string | null, day: string) {
  const [context, setContext] = useState<OfflineWorkoutContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [preparedAt, setPreparedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let dirty = false;
    setContext(null); setPreparedAt(null); setError(null); setLoading(true);
    const read = async () => {
      if (!owner) return;
      try {
        const cached = await readOfflineWorkoutContext(owner, day);
        if (!cancelled) {
          setPreparedAt(cached?.preparedAt ?? null);
          // Status events reread SQLite; identical plans keep their object identity.
          setContext(previous => JSON.stringify(previous && { ...previous, preparedAt: null }) === JSON.stringify(cached && { ...cached, preparedAt: null }) ? previous : cached);
        }
        return cached;
      } catch (err) {
        if (!cancelled) setError(toUserMessage(err, "Не удалось прочитать сохранённый план"));
      }
    };
    const refresh = async () => {
      if (!owner) { setLoading(false); return; }
      const cached = await read();
      if (!cancelled) setLoading(false);
      try {
        if (cancelled || !isOnline() || !getStoredToken() || !await canPrepareOfflineWorkoutContext(owner)) return;
        if (!dirty && cached && Date.now() - Date.parse(cached.preparedAt) < 300_000) return;
        await prepareOfflineWorkoutContext(owner, day);
        dirty = false;
        if (!cancelled) { setError(null); await read(); }
      } catch (err) {
        if (!cancelled) setError(toUserMessage(err, "Не удалось подготовить планы без сети"));
      }
    };
    void refresh();
    const onPrepared = () => { void read(); };
    const onReady = () => { void refresh(); };
    const onChanged = () => { dirty = true; void refresh(); };
    window.addEventListener("online", onChanged);
    window.addEventListener("fitness:offline-sync-ready", onReady);
    window.addEventListener("fitness:sync-complete", onChanged);
    window.addEventListener("fitness:offline-prepared", onPrepared);
    window.addEventListener("fitness:native-change", onPrepared);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onChanged);
      window.removeEventListener("fitness:offline-sync-ready", onReady);
      window.removeEventListener("fitness:sync-complete", onChanged);
      window.removeEventListener("fitness:offline-prepared", onPrepared);
      window.removeEventListener("fitness:native-change", onPrepared);
    };
  }, [owner, day]);
  return { context, loading, error, preparedAt };
}
