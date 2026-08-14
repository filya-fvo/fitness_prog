/**
 * Daily habits check-in: water, weight, sleep (local + water sync to server).
 */
import { useEffect, useState } from "react";

import { getStoredToken } from "@/api/client";
import { fetchWaterLog, saveWaterLog } from "@/api/notifications";
import { DecimalInput } from "@/components/DecimalInput";
import { trackEvent } from "@/lib/analytics";
import { toast } from "@/store/toastStore";
import {
  addWater,
  getHabitDay,
  habitStreak,
  saveHabitDay,
  type HabitDay,
} from "@/utils/habits";
import { isOnline } from "@/utils/network";
import { localDateKey } from "@/utils/progress";

export function HabitsCheckin() {
  const today = localDateKey(new Date());
  const [day, setDay] = useState<HabitDay>(() => getHabitDay(today));
  const [weight, setWeight] = useState(day.weightKg != null ? String(day.weightKg) : "");
  const [sleep, setSleep] = useState(day.sleepHours != null ? String(day.sleepHours) : "");
  const [waterTargetMl, setWaterTargetMl] = useState<number | null>(null);
  const [syncingWater, setSyncingWater] = useState(false);
  const streak = habitStreak();

  useEffect(() => {
    if (!getStoredToken() || !isOnline()) return;
    let cancelled = false;
    void fetchWaterLog(today)
      .then((res) => {
        if (cancelled) return;
        if (res.daily_target_ml != null) setWaterTargetMl(res.daily_target_ml);
        // Prefer higher of local/server so offline taps are not lost.
        const local = getHabitDay(today);
        const serverMl = Number(res.ml) || 0;
        const merged = Math.max(local.waterMl || 0, serverMl);
        if (merged !== local.waterMl) {
          setDay(saveHabitDay({ ...local, waterMl: merged }));
        }
        if (serverMl < merged) {
          void saveWaterLog({ ml: merged, date: today, mode: "set" }).catch(() => null);
        }
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [today]);

  function refresh() {
    const next = getHabitDay(today);
    setDay(next);
  }

  async function syncWater(ml: number) {
    if (!getStoredToken() || !isOnline()) return;
    setSyncingWater(true);
    try {
      const res = await saveWaterLog({ ml, date: today, mode: "set" });
      if (res.daily_target_ml != null) setWaterTargetMl(res.daily_target_ml);
    } catch {
      /* soft — local still kept */
    } finally {
      setSyncingWater(false);
    }
  }

  function saveMeta(source: "manual" | "water" | "meta" = "meta") {
    const w = weight.trim() === "" ? null : Number(weight);
    const s = sleep.trim() === "" ? null : Number(sleep);
    const next = saveHabitDay({
      ...getHabitDay(today),
      weightKg: w != null && Number.isFinite(w) && w > 0 ? w : null,
      sleepHours: s != null && Number.isFinite(s) && s >= 0 ? s : null,
    });
    setDay(next);
    trackEvent("habit_checked", {
      source,
      water_ml: next.waterMl,
      has_weight: next.weightKg != null,
      has_sleep: next.sleepHours != null,
    });
  }

  const waterLeft =
    waterTargetMl != null ? Math.max(0, waterTargetMl - (day.waterMl || 0)) : null;

  return (
    <div className="rounded-2xl bg-tg-secondary p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Привычки сегодня</p>
        <p className="text-[11px] text-tg-hint">серия {streak} дн.</p>
      </div>
      <div className="mb-3">
        <p className="mb-1 text-xs text-tg-hint">
          Вода: {day.waterMl} мл
          {waterTargetMl != null ? ` / ${waterTargetMl} мл` : ""}
          {waterLeft != null ? ` · осталось ${waterLeft}` : ""}
          {syncingWater ? " · …" : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {[250, 500].map((ml) => (
            <button
              key={ml}
              type="button"
              onClick={() => {
                const next = addWater(ml, today);
                setDay(next);
                void syncWater(next.waterMl);
                const target = waterTargetMl;
                toast(
                  target != null
                    ? `Вода ${next.waterMl} / ${target} мл`
                    : `Вода ${next.waterMl} мл`,
                );
                trackEvent("habit_checked", {
                  source: "water",
                  water_ml: next.waterMl,
                  delta_ml: ml,
                });
              }}
              className="tap-target-x min-h-[44px] rounded-full bg-tg-bg px-3 py-2 text-xs"
            >
              +{ml} мл
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              const cur = getHabitDay(today);
              const next = saveHabitDay({ ...cur, waterMl: 0 });
              setDay(next);
              void syncWater(0);
              toast("Вода сброшена", "info");
            }}
            className="tap-target-x min-h-[44px] rounded-full bg-tg-bg px-3 py-2 text-xs text-tg-hint"
          >
            Сброс
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-tg-hint">
          Вес, кг
          <DecimalInput
            value={weight}
            onValueChange={setWeight}
            onBlur={() => saveMeta()}
            placeholder="—"
            className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-tg-hint">
          Сон, ч
          <DecimalInput
            value={sleep}
            onValueChange={setSleep}
            onBlur={() => saveMeta()}
            placeholder="—"
            className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => {
          saveMeta("manual");
          refresh();
        }}
        className="tap-target-x mt-3 min-h-[44px] w-full rounded-xl bg-tg-bg px-3 py-2 text-xs font-medium text-tg-link"
      >
        {day.checkedIn ? "Обновить чекин" : "Отметить день"}
      </button>
    </div>
  );
}
