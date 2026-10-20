import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import { getStoredToken } from "@/api/client";
import { canPrepareOfflineWorkoutContext, prepareOfflineWorkoutContext, readOfflineWorkoutContext, type OfflineWorkoutContext } from "@/db/offlineWorkoutContext";
import { isOnline } from "@/utils/network";
import { toUserMessage } from "@/utils/errors";
import { subscribeReadCacheUpdates } from "@/lib/readCacheUpdates";

export function useOfflineWorkoutContext(owner: string | null, day: string) {
  const [context, setContext] = useState<OfflineWorkoutContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [preparedAt, setPreparedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState({ owner: "", day: "", days: 14, revision: 0 });
  const [tooLarge, setTooLarge] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [preparationDays, setPreparationDays] = useState(14);
  const prepareRange = useCallback((days: number) => {
    if (owner && Number.isInteger(days) && days >= 1 && days <= 14) setRequest(previous => ({ owner, day, days, revision: previous.revision + 1 }));
  }, [owner, day]);
  useEffect(() => {
    let cancelled = false;
    const manual = request.owner === owner && request.day === day && request.revision > 0;
    let dirty = manual;
    let refreshing = false;
    setContext(null); setPreparedAt(null); setError(null); setTooLarge(false); setPreparing(false); setLoading(true);
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
      if (refreshing) return;
      refreshing = true;
      const cached = await read();
      if (!cancelled) setLoading(false);
      try {
        if (cancelled || !isOnline() || !getStoredToken() || !await canPrepareOfflineWorkoutContext(owner)) return;
        if (!dirty && cached && Date.now() - Date.parse(cached.preparedAt) < 300_000) return;
        const days = manual ? request.days : cached?.preparedDays ?? 14;
        if (!cancelled) { setPreparationDays(days); setPreparing(true); }
        await prepareOfflineWorkoutContext(owner, day, days);
        dirty = false;
        if (!cancelled) { setError(null); setTooLarge(false); await read(); }
      } catch (err) {
        if (!cancelled) {
          const large = axios.isAxiosError(err) && err.response?.status === 413;
          setTooLarge(large);
          setError(large ? "Планы слишком большие. Выберите меньше дней" : toUserMessage(err, "Не удалось подготовить планы без сети"));
        }
      } finally { refreshing = false; if (!cancelled) setPreparing(false); }
    };
    void refresh();
    const onPrepared = () => { void read(); };
    const onReady = () => { void refresh(); };
    const onChanged = () => { dirty = true; void refresh(); };
    const stopRefresh = subscribeReadCacheUpdates(owner, ["/users/me"], onChanged);
    window.addEventListener("online", onChanged);
    window.addEventListener("fitness:offline-sync-ready", onReady);
    window.addEventListener("fitness:sync-complete", onChanged);
    window.addEventListener("fitness:offline-prepared", onPrepared);
    window.addEventListener("fitness:native-change", onPrepared);
    return () => {
      cancelled = true;
      stopRefresh();
      window.removeEventListener("online", onChanged);
      window.removeEventListener("fitness:offline-sync-ready", onReady);
      window.removeEventListener("fitness:sync-complete", onChanged);
      window.removeEventListener("fitness:offline-prepared", onPrepared);
      window.removeEventListener("fitness:native-change", onPrepared);
    };
  }, [owner, day, request]);
  return { context, loading, error, preparedAt, tooLarge, preparing, preparationDays, prepareRange };
}
