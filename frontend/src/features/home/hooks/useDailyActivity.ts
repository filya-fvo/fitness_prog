import { useCallback, useEffect, useRef, useState } from "react";

import { getStoredToken } from "@/api/client";
import { fetchDailyMetrics, saveDailyMetrics } from "@/api/dailyMetrics";
import { fetchWaterLog, saveWaterLog } from "@/api/notifications";
import { trackEvent } from "@/lib/analytics";
import { toast } from "@/store/toastStore";
import { useUserStore } from "@/store/userStore";
import {
  addWater,
  cacheHabitDay,
  getHabitDay,
  habitStreak,
  saveHabitDay,
  type HabitDay,
} from "@/utils/habits";
import { isOnline } from "@/utils/network";
import { localDateKey } from "@/utils/progress";

function valueOrEmpty(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function parseNullable(raw: string): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export type DailyActivity = {
  selectedDate: string;
  today: string;
  day: HabitDay;
  sleep: string;
  steps: string;
  activeMinutes: string;
  waterTargetMl: number | null;
  waterLeft: number | null;
  dateLabel: string;
  streak: number;
  saving: boolean;
  loading: boolean;
  syncingWater: boolean;
  setSleep: (value: string) => void;
  setSteps: (value: string) => void;
  setActiveMinutes: (value: string) => void;
  shiftDate: (delta: number) => void;
  saveCheckin: () => Promise<void>;
  addWater: (ml: number) => void;
  resetWater: () => void;
};

/** Keeps daily recovery data locally responsive and synchronises it whenever a session is available. */
export function useDailyActivity(date?: string): DailyActivity {
  const ownerUserId = useUserStore((state) => state.user?.id);
  const waterSyncQueue = useRef<Promise<void>>(Promise.resolve());
  const today = localDateKey(new Date());
  const [internalDate, setInternalDate] = useState(today);
  const selectedDate = date ?? internalDate;
  const [day, setDay] = useState<HabitDay>(() => getHabitDay(selectedDate, ownerUserId));
  const [sleep, setSleep] = useState("");
  const [steps, setSteps] = useState("");
  const [activeMinutes, setActiveMinutes] = useState("");
  const [waterTargetMl, setWaterTargetMl] = useState<number | null>(null);
  const [syncingWater, setSyncingWater] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const streak = habitStreak(new Date(), ownerUserId);

  const syncPendingWater = useCallback((targetDate: string) => {
    setSyncingWater(true);
    const sync = async () => {
      if (!getStoredToken() || !isOnline()) return;
      const pending = getHabitDay(targetDate, ownerUserId);
      if (!pending.waterPending) return;
      try {
        const response = await saveWaterLog({ ml: pending.waterMl, date: targetDate, mode: "set" });
        const latest = getHabitDay(targetDate, ownerUserId);
        if (latest.waterPending && latest.waterMl === pending.waterMl) {
          cacheHabitDay({ ...latest, waterPending: false }, ownerUserId);
        }
        if (response.daily_target_ml != null) setWaterTargetMl(response.daily_target_ml);
        window.dispatchEvent(new CustomEvent("fitness:water-updated", {
          detail: { date: targetDate, ml: response.ml },
        }));
      } catch {
        // Keep the pending local value; the online event or next load retries it.
      }
    };
    const queued = waterSyncQueue.current.then(sync, sync);
    waterSyncQueue.current = queued;
    void queued.finally(() => {
      if (waterSyncQueue.current === queued) setSyncingWater(false);
    });
  }, [ownerUserId]);

  useEffect(() => {
    let cancelled = false;
    const local = getHabitDay(selectedDate, ownerUserId);
    setDay(local);
    setSleep(valueOrEmpty(local.sleepHours));
    setSteps(valueOrEmpty(local.steps));
    setActiveMinutes(valueOrEmpty(local.activeMinutes));

    if (!getStoredToken() || !isOnline()) return;
    setLoading(true);
    void Promise.all([fetchDailyMetrics(selectedDate), fetchWaterLog(selectedDate)])
      .then(([metrics, water]) => {
        if (cancelled) return;
        if (water.daily_target_ml != null) setWaterTargetMl(water.daily_target_ml);
        const merged: HabitDay = {
          ...local,
          waterMl: local.waterPending ? local.waterMl : Number(water.ml) || 0,
          waterPending: local.waterPending,
          sleepHours: metrics.sleep_minutes != null ? metrics.sleep_minutes / 60 : local.sleepHours,
          steps: metrics.steps ?? local.steps ?? null,
          activeMinutes: metrics.active_minutes ?? local.activeMinutes ?? null,
        };
        setDay(cacheHabitDay(merged, ownerUserId));
        setSleep(valueOrEmpty(merged.sleepHours));
        setSteps(valueOrEmpty(merged.steps));
        setActiveMinutes(valueOrEmpty(merged.activeMinutes));
        const hasOfflineMetrics =
          (metrics.sleep_minutes == null && local.sleepHours != null) ||
          (metrics.steps == null && local.steps != null) ||
          (metrics.active_minutes == null && local.activeMinutes != null);
        if (hasOfflineMetrics) {
          void saveDailyMetrics({
            sleepMinutes: merged.sleepHours != null ? Math.round(merged.sleepHours * 60) : null,
            steps: merged.steps ?? null,
            activeMinutes: merged.activeMinutes ?? null,
          }, selectedDate).catch(() => null);
        }
        if (merged.waterPending) syncPendingWater(selectedDate);
      })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [ownerUserId, selectedDate, syncPendingWater]);

  useEffect(() => {
    const retry = () => syncPendingWater(selectedDate);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [selectedDate, syncPendingWater]);

  const saveCheckin = useCallback(async () => {
    const sleepHours = parseNullable(sleep);
    const stepsValue = parseNullable(steps);
    const activeValue = parseNullable(activeMinutes);
    if (
      (sleep.trim() && (sleepHours == null || sleepHours < 0 || sleepHours > 24)) ||
      (steps.trim() && (stepsValue == null || stepsValue < 0 || stepsValue > 200_000)) ||
      (activeMinutes.trim() && (activeValue == null || activeValue < 0 || activeValue > 1440))
    ) {
      toast("Проверьте введённые значения", "error");
      return;
    }
    const next = saveHabitDay({
      ...getHabitDay(selectedDate, ownerUserId),
      sleepHours,
      steps: stepsValue == null ? null : Math.round(stepsValue),
      activeMinutes: activeValue == null ? null : Math.round(activeValue),
    }, ownerUserId);
    setDay(next);
    setSaving(true);
    try {
      if (getStoredToken() && isOnline()) {
        await saveDailyMetrics({
          sleepMinutes: next.sleepHours != null ? Math.round(next.sleepHours * 60) : null,
          steps: next.steps ?? null,
          activeMinutes: next.activeMinutes ?? null,
        }, selectedDate);
        toast("Показатели сохранены");
      } else {
        toast("Сохранено на устройстве — синхронизируем позже", "info");
      }
      trackEvent("habit_checked", {
        source: "manual", water_ml: next.waterMl, has_sleep: next.sleepHours != null,
        steps: next.steps ?? 0, active_minutes: next.activeMinutes ?? 0,
      });
    } catch {
      toast("Сохранено на устройстве, сервер временно недоступен", "info");
    } finally {
      setSaving(false);
    }
  }, [activeMinutes, ownerUserId, selectedDate, sleep, steps]);

  const addWaterAmount = useCallback((ml: number) => {
    const next = addWater(ml, selectedDate, ownerUserId);
    setDay(next);
    syncPendingWater(selectedDate);
  }, [ownerUserId, selectedDate, syncPendingWater]);

  const resetWater = useCallback(() => {
    const next = saveHabitDay({ ...getHabitDay(selectedDate, ownerUserId), waterMl: 0, waterPending: true }, ownerUserId);
    setDay(next);
    syncPendingWater(selectedDate);
  }, [ownerUserId, selectedDate, syncPendingWater]);

  const shiftDate = useCallback((delta: number) => {
    const next = new Date(`${selectedDate}T12:00:00`);
    next.setDate(next.getDate() + delta);
    const key = localDateKey(next);
    if (key <= today) setInternalDate(key);
  }, [selectedDate, today]);

  const dateLabel = selectedDate === today
    ? "Сегодня"
    : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(`${selectedDate}T12:00:00`));

  return {
    selectedDate, today, day, sleep, steps, activeMinutes, waterTargetMl,
    waterLeft: waterTargetMl == null ? null : Math.max(0, waterTargetMl - day.waterMl),
    dateLabel, streak, saving, loading, syncingWater, setSleep, setSteps, setActiveMinutes,
    shiftDate, saveCheckin, addWater: addWaterAmount, resetWater,
  };
}
