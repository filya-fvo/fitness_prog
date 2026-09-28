import { DecimalInput } from "@/components/DecimalInput";
import { Header } from "@/components/layout/Header";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { ActivityIcon } from "@/features/home/components/DailyActivityCards";
import { useDailyActivity } from "@/features/home/hooks/useDailyActivity";

const cardMeta = {
  sleep: { title: "Сон", goal: "Рекомендуется 7–9 ч", color: "text-violet-400", bar: "bg-sky-400" },
  water: { title: "Вода", goal: "Цель на день", color: "text-cyan-400", bar: "bg-cyan-400" },
  steps: { title: "Шаги", goal: "Цель: 10 000", color: "text-teal-400", bar: "bg-teal-400" },
} as const;

function progress(value: number, target: number): number {
  return Math.min(100, Math.max(0, Math.round(value / target * 100)));
}

export function DailyActivityPage() {
  const activity = useDailyActivity();
  const sleep = Number(activity.sleep) || 0;
  const steps = Number(activity.steps) || 0;
  const waterTarget = activity.waterTargetMl ?? 2500;
  const values = {
    sleep: { value: activity.sleep, percent: progress(sleep, 8), step: 0.5 },
    water: { value: String(activity.day.waterMl), percent: progress(activity.day.waterMl, waterTarget), step: 250 },
    steps: { value: activity.steps, percent: progress(steps, 10000), step: 1000 },
  };

  const change = (kind: keyof typeof values, delta: number) => {
    if (kind === "sleep") activity.setSleep(String(Math.min(24, Math.max(0, sleep + delta))));
    if (kind === "water") activity.addWater(delta);
    if (kind === "steps") activity.setSteps(String(Math.min(200000, Math.max(0, steps + delta))));
  };

  return (
    <section className="daily-activity-page mx-auto max-w-xl pb-6">
      <Header title="Активность за день" showBack fallbackTo="/" />
      <AppCard tone="ocean" className="mb-3 flex items-center gap-2 p-2">
        <button type="button" onClick={() => activity.shiftDate(-1)} aria-label="Предыдущий день"
          className="app-secondary-action tap-target min-h-[44px] min-w-[44px] rounded-xl text-xl">‹</button>
        <label className="min-w-0 flex-1 text-center text-xs text-tg-hint">
          <span className="block font-semibold text-tg-text">{activity.dateLabel}</span>
          <input type="date" aria-label="Выбрать день" value={activity.selectedDate} max={activity.today}
            onChange={(event) => activity.selectDate(event.target.value)}
            className="mt-1 w-full bg-transparent text-center text-base text-tg-hint" />
        </label>
        <button type="button" onClick={() => activity.shiftDate(1)} disabled={activity.selectedDate >= activity.today}
          aria-label="Следующий день" className="app-secondary-action tap-target min-h-[44px] min-w-[44px] rounded-xl text-xl disabled:opacity-30">›</button>
      </AppCard>

      <div className="space-y-2">
        {(["sleep", "water", "steps"] as const).map((kind) => {
          const meta = cardMeta[kind];
          const row = values[kind];
          return (
            <AppCard key={kind} tone="ocean" role="region" aria-label={meta.title} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <span className={meta.color}><ActivityIcon kind={kind} /></span>{meta.title}
                </h2>
                <span className="text-xs text-tg-hint">{kind === "water" ? `Цель: ${waterTarget.toLocaleString("ru-RU")} мл` : meta.goal}</span>
              </div>
              <div className="my-3 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
                <button type="button" onClick={() => change(kind, -row.step)} aria-label={`Уменьшить: ${meta.title}`}
                  className="app-secondary-action tap-target min-h-[44px] rounded-xl text-xl">−</button>
                <div className="flex min-w-0 items-center justify-center rounded-xl border border-tg-hint/20 bg-tg-bg/40 px-2">
                  {kind === "water" ? (
                    <input type="number" inputMode="numeric" min={0} max={10000} value={row.value}
                      aria-label="Вода, мл" onChange={(event) => activity.setWaterMl(Number(event.target.value))}
                      className="min-h-[44px] min-w-0 w-full bg-transparent text-center text-base font-semibold text-tg-text" />
                  ) : (
                    <DecimalInput min={0} max={kind === "sleep" ? 24 : 200000} value={row.value}
                      onValueChange={kind === "sleep" ? activity.setSleep : activity.setSteps}
                      aria-label={kind === "sleep" ? "Сон, часов" : "Шаги"}
                      placeholder="—" className="min-h-[44px] min-w-0 w-full bg-transparent text-center text-base font-semibold text-tg-text" />
                  )}
                  <span className="shrink-0 text-xs text-tg-hint">{kind === "sleep" ? "ч" : kind === "water" ? "мл" : ""}</span>
                </div>
                <button type="button" onClick={() => change(kind, row.step)} aria-label={`Увеличить: ${meta.title}`}
                  className="app-secondary-action tap-target min-h-[44px] rounded-xl text-xl">+</button>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-700/70">
                <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${row.percent}%` }} />
              </div>
              <p className="mt-1.5 text-right text-xs text-cyan-400">{row.percent}%</p>
              {kind === "water" ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {[250, 500].map((ml) => <button key={ml} type="button" onClick={() => activity.addWater(ml)}
                    className="app-secondary-action tap-target min-h-[44px] rounded-xl text-sm">+{ml} мл</button>)}
                </div>
              ) : null}
            </AppCard>
          );
        })}
      </div>
      <AppButton tone="primary" disabled={activity.saving || activity.loading} onClick={() => void activity.saveCheckin()}
        className="mt-3 min-h-[50px] w-full">
        {activity.saving ? "Сохраняем…" : activity.loading ? "Загрузка…" : "Сохранить показатели"}
      </AppButton>
      <details className="mt-3 rounded-xl border border-tg-hint/20 p-3">
        <summary className="cursor-pointer text-sm font-medium">Дополнительно</summary>
        <label className="mt-3 block text-sm text-tg-hint">Активность, минут
          <DecimalInput min={0} max={1440} value={activity.activeMinutes} onValueChange={activity.setActiveMinutes}
            className="app-field mt-1 w-full" placeholder="например, 45" />
        </label>
      </details>
    </section>
  );
}
