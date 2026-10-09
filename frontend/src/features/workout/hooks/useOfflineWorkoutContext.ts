import { useEffect, useState } from "react";
import { getStoredToken } from "@/api/client";
import { prepareOfflineWorkoutContext, readOfflineWorkoutContext, type OfflineWorkoutContext } from "@/db/offlineWorkoutContext";
import { isOnline } from "@/utils/network";
import { toUserMessage } from "@/utils/errors";

export function useOfflineWorkoutContext(owner: string | null, day: string) {
  const [context, setContext] = useState<OfflineWorkoutContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setContext(null); setError(null); setLoading(true);
    const read = async () => {
      if (!owner) return;
      try {
        const cached = await readOfflineWorkoutContext(owner, day);
        if (!cancelled) setContext(cached);
      } catch (err) {
        if (!cancelled) setError(toUserMessage(err, "Не удалось прочитать сохранённый план"));
      }
    };
    const refresh = async () => {
      if (!owner) { setLoading(false); return; }
      await read();
      if (!cancelled) setLoading(false);
      if (!isOnline() || !getStoredToken()) return;
      try {
        await prepareOfflineWorkoutContext(owner, day);
        if (!cancelled) { setError(null); await read(); }
      } catch (err) {
        if (!cancelled) setError(toUserMessage(err, "Не удалось подготовить планы без сети"));
      }
    };
    void refresh();
    const onPrepared = () => { void read(); };
    const onOnline = () => { void refresh(); };
    window.addEventListener("online", onOnline);
    window.addEventListener("fitness:offline-prepared", onPrepared);
    window.addEventListener("fitness:native-change", onPrepared);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("fitness:offline-prepared", onPrepared);
      window.removeEventListener("fitness:native-change", onPrepared);
    };
  }, [owner, day]);
  return { context, loading, error, preparedAt: context?.preparedAt ?? null };
}
