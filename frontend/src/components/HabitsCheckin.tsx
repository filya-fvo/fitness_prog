/** Manual daily sleep, movement and water check-in. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { getStoredToken } from "@/api/client";
import { fetchDailyMetrics, saveDailyMetrics, type DailyMetric } from "@/api/dailyMetrics";
import { fetchWaterLog, saveWaterLog } from "@/api/notifications";
import { DecimalInput } from "@/components/DecimalInput";
import { CycleReadinessInput } from "@/components/CycleReadinessInput";
import { trackEvent } from "@/lib/analytics";
import { toast } from "@/store/toastStore";
import { useUserStore } from "@/store/userStore";
import { isCycleReadiness, type CycleReadiness } from "@/utils/cycleTraining";
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

type Props = {
  date?: string;
  onSaved?: (metrics: DailyMetric) => void;
  cycleTrainingEnabled?: boolean;
};

function valueOrEmpty(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function parseNullable(raw: string): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function HabitsCheckin({ date, onSaved, cycleTrainingEnabled = false }: Props) {
  const location = useLocation();
  const ownerUserId = useUserStore((state) => state.user?.id);
  const checkinRef = useRef<HTMLElement>(null);
  const waterRef = useRef<HTMLDivElement>(null);
  const waterSyncQueue = useRef<Promise<void>>(Promise.resolve());
  const today = localDateKey(new Date());
  const [internalDate, setInternalDate] = useState(today);
  const selectedDate = date ?? internalDate;
  const [day, setDay] = useState<HabitDay>(() => getHabitDay(selectedDate, ownerUserId));
  const [sleep, setSleep] = useState("");
  const [steps, setSteps] = useState("");
  const [activeMinutes, setActiveMinutes] = useState("");
  const [cycleReadiness, setCycleReadiness] = useState<CycleReadiness | null>(null);
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
        const response = await saveWaterLog({
          ml: pending.waterMl,
          date: targetDate,
          mode: "set",
        });
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
    void queued.then(
      () => {
        if (waterSyncQueue.current === queued) setSyncingWater(false);
      },
      () => {
        if (waterSyncQueue.current === queued) setSyncingWater(false);
      },
    );
  }, [ownerUserId]);

  const syncPendingCycleReadiness = useCallback((targetDate: string) => {
    if (!cycleTrainingEnabled || !getStoredToken() || !isOnline()) return;
    const pending = getHabitDay(targetDate, ownerUserId);
    if (!pending.cycleReadinessPending || pending.cycleReadiness == null) return;
    void saveDailyMetrics(
      { cycleReadiness: pending.cycleReadiness },
      targetDate,
    ).then((saved) => {
      const latest = getHabitDay(targetDate, ownerUserId);
      if (
        latest.cycleReadinessPending &&
        latest.cycleReadiness === pending.cycleReadiness
      ) {
        const synced = cacheHabitDay(
          { ...latest, cycleReadinessPending: false },
          ownerUserId,
        );
        setDay(synced);
      }
      onSaved?.(saved);
    }).catch(() => null);
  }, [cycleTrainingEnabled, onSaved, ownerUserId]);

  useEffect(() => {
    const metric = new URLSearchParams(location.search).get("checkin");
    if (metric !== "water") return;
    window.requestAnimationFrame(() => {
      checkinRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      waterRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    });
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;
    const local = getHabitDay(selectedDate, ownerUserId);
    setDay(local);
    setSleep(valueOrEmpty(local.sleepHours));
    setSteps(valueOrEmpty(local.steps));
    setActiveMinutes(valueOrEmpty(local.activeMinutes));
    setCycleReadiness(local.cycleReadiness ?? null);

    if (!getStoredToken() || !isOnline()) return;
    setLoading(true);
    void Promise.all([fetchDailyMetrics(selectedDate), fetchWaterLog(selectedDate)])
      .then(([metrics, water]) => {
        if (cancelled) return;
        if (water.daily_target_ml != null) setWaterTargetMl(water.daily_target_ml);
        const serverWaterMl = Number(water.ml) || 0;
        const merged: HabitDay = {
          ...local,
          waterMl: local.waterPending ? local.waterMl : serverWaterMl,
          waterPending: local.waterPending,
          sleepHours:
            metrics.sleep_minutes != null ? metrics.sleep_minutes / 60 : local.sleepHours,
          steps: metrics.steps ?? local.steps ?? null,
          activeMinutes: metrics.active_minutes ?? local.activeMinutes ?? null,
          cycleReadiness: local.cycleReadinessPending
            ? local.cycleReadiness ?? null
            : isCycleReadiness(metrics.cycle_readiness)
              ? metrics.cycle_readiness
              : local.cycleReadiness ?? null,
          cycleReadinessPending: local.cycleReadinessPending === true,
        };
        setDay(cacheHabitDay(merged, ownerUserId));
        setSleep(valueOrEmpty(merged.sleepHours));
        setSteps(valueOrEmpty(merged.steps));
        setActiveMinutes(valueOrEmpty(merged.activeMinutes));
        setCycleReadiness(merged.cycleReadiness ?? null);
        const hasOfflineMetrics =
          (metrics.sleep_minutes == null && local.sleepHours != null) ||
          (metrics.steps == null && local.steps != null) ||
          (metrics.active_minutes == null && local.activeMinutes != null);
        const hasOfflineCycleReadiness =
          cycleTrainingEnabled && local.cycleReadinessPending === true;
        if (hasOfflineMetrics || hasOfflineCycleReadiness) {
          void saveDailyMetrics(
            {
              sleepMinutes:
                merged.sleepHours != null ? Math.round(merged.sleepHours * 60) : null,
              steps: merged.steps ?? null,
              activeMinutes: merged.activeMinutes ?? null,
              cycleReadiness: cycleTrainingEnabled ? merged.cycleReadiness ?? null : undefined,
            },
            selectedDate,
          )
            .then((saved) => {
              const latest = getHabitDay(selectedDate, ownerUserId);
              if (
                latest.cycleReadinessPending &&
                latest.cycleReadiness === merged.cycleReadiness
              ) {
                cacheHabitDay({ ...latest, cycleReadinessPending: false }, ownerUserId);
              }
              onSaved?.(saved);
            })
            .catch(() => null);
        }
        if (merged.waterPending) syncPendingWater(selectedDate);
      })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cycleTrainingEnabled, onSaved, ownerUserId, selectedDate, syncPendingWater]);

  useEffect(() => {
    const retry = () => {
      syncPendingWater(selectedDate);
      syncPendingCycleReadiness(selectedDate);
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [selectedDate, syncPendingCycleReadiness, syncPendingWater]);

  async function saveCheckin() {
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
      sleepHours: sleepHours != null && sleepHours >= 0 && sleepHours <= 24 ? sleepHours : null,
      steps:
        stepsValue != null && stepsValue >= 0 && stepsValue <= 200_000
          ? Math.round(stepsValue)
          : null,
      activeMinutes:
        activeValue != null && activeValue >= 0 && activeValue <= 1440
          ? Math.round(activeValue)
          : null,
      cycleReadiness: cycleTrainingEnabled ? cycleReadiness : null,
      cycleReadinessPending: cycleTrainingEnabled,
    }, ownerUserId);
    setDay(next);
    setSaving(true);
    try {
      if (getStoredToken() && isOnline()) {
        const saved = await saveDailyMetrics(
          {
            sleepMinutes:
              next.sleepHours != null ? Math.round(next.sleepHours * 60) : null,
            steps: next.steps ?? null,
            activeMinutes: next.activeMinutes ?? null,
            cycleReadiness: cycleTrainingEnabled ? next.cycleReadiness ?? null : undefined,
          },
          selectedDate,
        );
        const synced = cacheHabitDay({ ...next, cycleReadinessPending: false }, ownerUserId);
        setDay(synced);
        onSaved?.(saved);
        toast("Показатели сохранены");
      } else {
        toast("Сохранено на устройстве — синхронизируем позже", "info");
      }
      trackEvent("habit_checked", {
        source: "manual",
        water_ml: next.waterMl,
        has_sleep: next.sleepHours != null,
        steps: next.steps ?? 0,
        active_minutes: next.activeMinutes ?? 0,
        has_cycle_checkin: cycleTrainingEnabled && next.cycleReadiness != null,
      });
    } catch {
      toast("Сохранено на устройстве, сервер временно недоступен", "info");
    } finally {
      setSaving(false);
    }
  }

  const waterLeft =
    waterTargetMl != null ? Math.max(0, waterTargetMl - (day.waterMl || 0)) : null;

  function shiftDate(delta: number) {
    const next = new Date(`${selectedDate}T12:00:00`);
    next.setDate(next.getDate() + delta);
    const key = localDateKey(next);
    if (key <= today) setInternalDate(key);
  }

  const dateLabel = selectedDate === today
    ? "Сегодня"
    : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(
        new Date(`${selectedDate}T12:00:00`),
      );

  return (
    <section
      id="daily-checkin"
      ref={checkinRef}
      className="min-w-0 max-w-full scroll-mt-4 overflow-hidden rounded-2xl bg-tg-secondary p-4"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Активность и восстановление</h2>
          <p className="mt-0.5 text-[11px] text-tg-hint">Ручной ввод · данные за выбранный день</p>
        </div>
        {date == null ? <p className="text-[11px] text-tg-hint">серия {streak} дн.</p> : null}
      </div>

      {date == null ? (
        <div className="mb-3 flex items-center justify-between rounded-xl bg-tg-bg px-2 py-1">
          <button
            type="button"
            aria-label="Предыдущий день"
            onClick={() => shiftDate(-1)}
            className="tap-target min-h-[44px] min-w-[44px] px-3 text-lg text-tg-link"
          >
            ‹
          </button>
          <p className="text-xs font-medium">{dateLabel}</p>
          <button
            type="button"
            aria-label="Следующий день"
            disabled={selectedDate >= today}
            onClick={() => shiftDate(1)}
            className="tap-target min-h-[44px] min-w-[44px] px-3 text-lg text-tg-link disabled:opacity-30"
          >
            ›
          </button>
        </div>
      ) : null}

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <label className="min-w-0 text-xs text-tg-hint">
          Сон, часов
          <DecimalInput
            min={0}
            max={24}
            value={sleep}
            onValueChange={setSleep}
            placeholder="например, 7,5"
            className="mt-1 min-w-0 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
          />
        </label>
        <label className="min-w-0 text-xs text-tg-hint">
          Шаги
          <DecimalInput
            min={0}
            max={200000}
            value={steps}
            onValueChange={setSteps}
            placeholder="например, 8000"
            className="mt-1 min-w-0 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
          />
        </label>
        <label className="min-w-0 text-xs text-tg-hint">
          Активность, минут
          <DecimalInput
            min={0}
            max={1440}
            value={activeMinutes}
            onValueChange={setActiveMinutes}
            placeholder="например, 45"
            className="mt-1 min-w-0 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
          />
        </label>
      </div>

      {cycleTrainingEnabled ? (
        <CycleReadinessInput value={cycleReadiness} onChange={setCycleReadiness} />
      ) : null}

      <div ref={waterRef} className="mt-3 rounded-xl bg-tg-bg p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-tg-hint">
            Вода: <span className="font-medium text-tg-text">{day.waterMl} мл</span>
            {waterTargetMl != null ? ` / ${waterTargetMl} мл` : ""}
          </p>
          <p className="text-[10px] text-tg-hint">
            {syncingWater ? "синхронизация…" : waterLeft != null ? `осталось ${waterLeft}` : ""}
          </p>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {[250, 500].map((ml) => (
            <button
              key={ml}
              type="button"
              onClick={() => {
                const next = addWater(ml, selectedDate, ownerUserId);
                setDay(next);
                syncPendingWater(selectedDate);
              }}
              className="tap-target-x min-h-[40px] rounded-full bg-tg-secondary px-3 py-2 text-xs"
            >
              +{ml} мл
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              const next = saveHabitDay({
                ...getHabitDay(selectedDate, ownerUserId),
                waterMl: 0,
                waterPending: true,
              }, ownerUserId);
              setDay(next);
              syncPendingWater(selectedDate);
            }}
            className="tap-target-x min-h-[40px] rounded-full bg-tg-secondary px-3 py-2 text-xs text-tg-hint"
          >
            Сбросить
          </button>
        </div>
      </div>

      <button
        type="button"
        disabled={saving || loading}
        onClick={() => void saveCheckin()}
        className="tap-target-x mt-3 min-h-[44px] w-full rounded-xl bg-tg-button px-3 py-2 text-sm font-semibold text-tg-button-text disabled:opacity-50"
      >
        {saving ? "Сохраняем…" : loading ? "Загрузка…" : "Сохранить показатели"}
      </button>
    </section>
  );
}
