import { DecimalInput } from "@/components/DecimalInput";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import type { DailyActivity } from "@/features/home/hooks/useDailyActivity";

type Props = {
  activity: DailyActivity;
  title?: string;
  id?: string;
  showStreak?: boolean;
  allowDateNavigation?: boolean;
};

/** Full manual editor shared by the home dialog and the dated diary check-in. */
export function DailyActivityEditor({
  activity,
  title = "Активность и восстановление",
  id,
  showStreak = true,
  allowDateNavigation = true,
}: Props) {
  return (
    <section id={id} className="min-w-0 max-w-full scroll-mt-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-tg-hint">Ручной ввод · данные за выбранный день</p>
        </div>
        {showStreak ? <p className="text-xs text-tg-hint">серия {activity.streak} дн.</p> : null}
      </div>

      {allowDateNavigation ? <AppCard tone="inset" className="mb-3 flex items-center justify-between px-2 py-1">
        <button
          type="button"
          aria-label="Предыдущий день"
          onClick={() => activity.shiftDate(-1)}
          className="tap-target app-ghost-action min-h-[44px] min-w-[44px] px-3 text-lg"
        >
          ‹
        </button>
        <p className="text-sm font-medium">{activity.dateLabel}</p>
        <button
          type="button"
          aria-label="Следующий день"
          disabled={activity.selectedDate >= activity.today}
          onClick={() => activity.shiftDate(1)}
          className="tap-target app-ghost-action min-h-[44px] min-w-[44px] px-3 text-lg disabled:opacity-30"
        >
          ›
        </button>
      </AppCard> : null}

      <div className="grid min-w-0 grid-cols-2 gap-2">
        <label className="min-w-0 text-xs text-tg-hint">
          Сон, часов
          <DecimalInput min={0} max={24} value={activity.sleep} onValueChange={activity.setSleep}
            placeholder="например, 7,5" className="app-field mt-1 min-w-0 w-full" />
        </label>
        <label className="min-w-0 text-xs text-tg-hint">
          Шаги
          <DecimalInput min={0} max={200000} value={activity.steps} onValueChange={activity.setSteps}
            placeholder="например, 8000" className="app-field mt-1 min-w-0 w-full" />
        </label>
        <label className="min-w-0 text-xs text-tg-hint">
          Активность, минут
          <DecimalInput min={0} max={1440} value={activity.activeMinutes} onValueChange={activity.setActiveMinutes}
            placeholder="например, 45" className="app-field mt-1 min-w-0 w-full" />
        </label>
      </div>

      <AppCard tone="inset" className="mt-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-tg-hint">
            Вода: <span className="font-medium text-tg-text">{activity.day.waterMl} мл</span>
            {activity.waterTargetMl != null ? ` / ${activity.waterTargetMl} мл` : ""}
          </p>
          <p className="text-[11px] text-tg-hint">
            {activity.syncingWater ? "синхронизация…" : activity.waterLeft != null ? `осталось ${activity.waterLeft}` : ""}
          </p>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {[250, 500].map((ml) => (
            <AppButton key={ml} tone="secondary" onClick={() => activity.addWater(ml)} className="min-h-[40px] px-3 py-2 text-xs">
              +{ml} мл
            </AppButton>
          ))}
          <AppButton tone="ghost" onClick={activity.resetWater} className="min-h-[40px] px-3 py-2 text-xs text-tg-hint">
            Сбросить
          </AppButton>
        </div>
      </AppCard>

      <AppButton
        tone="primary"
        disabled={activity.saving || activity.loading}
        onClick={() => void activity.saveCheckin()}
        className="mt-3 min-h-[44px] w-full"
      >
        {activity.saving ? "Сохраняем…" : activity.loading ? "Загрузка…" : "Сохранить показатели"}
      </AppButton>
    </section>
  );
}
