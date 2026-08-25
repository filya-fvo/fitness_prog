import type { NutritionBalanceDay, NutritionPeriodTotals } from "@/utils/progress";

type Props = {
  mode: "day" | "week";
  series: NutritionBalanceDay[];
  dailyTarget: number | null;
  periods: {
    day: NutritionPeriodTotals;
    week: NutritionPeriodTotals;
    month: NutritionPeriodTotals;
  } | null;
};

function fmtDelta(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const rounded = Math.round(n);
  if (rounded === 0) return "0";
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

function fmtKcal(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return String(Math.round(n));
}

function PeriodCard({ item }: { item: NutritionPeriodTotals }) {
  const deltaClass =
    item.delta == null
      ? ""
      : item.delta > 0
        ? "text-orange-600"
        : item.delta < 0
          ? "text-emerald-700"
          : "";
  return (
    <div className="rounded-xl bg-tg-bg p-2.5">
      <p className="text-[11px] font-medium text-tg-text">{item.label}</p>
      <p className="text-[10px] text-tg-hint">{item.rangeLabel}</p>
      <p className="mt-1.5 text-lg font-semibold tabular-nums leading-none">
        {fmtKcal(item.eaten)}
        <span className="ml-0.5 text-[11px] font-normal text-tg-hint">ккал</span>
      </p>
      <p className="mt-1 text-[10px] text-tg-hint">
        цель {fmtKcal(item.target)}
        {item.daysCount > 1 ? ` · ${item.daysCount} дн.` : ""}
      </p>
      <p className={["mt-0.5 text-xs font-semibold tabular-nums", deltaClass].join(" ")}>
        {item.delta == null
          ? "баланс —"
          : item.delta > 0
            ? `перебор ${fmtDelta(item.delta)}`
            : item.delta < 0
              ? `недобор ${fmtDelta(Math.abs(item.delta))}`
              : "в цели"}
      </p>
    </div>
  );
}

export function NutritionBalanceChart({ mode, series, dailyTarget, periods }: Props) {
  const maxAbs = Math.max(
    1,
    ...series.filter((day) => day.hasLogs).map((day) => Math.abs(day.delta ?? 0)),
  );
  const lastLoggedDate = [...series].reverse().find((day) => day.hasLogs)?.date ?? null;

  return (
    <section className="rounded-2xl bg-tg-secondary p-4">
      <h2 className="text-sm font-semibold">Питание: калории</h2>
      <p className="mt-1 text-xs text-tg-hint">
        Три окна: сегодня, текущая неделя (с понедельника) и текущий месяц (с 1-го числа).
        Цель/день: {dailyTarget != null ? `${Math.round(dailyTarget)} ккал` : "—"}.
      </p>

      {periods ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <PeriodCard item={periods.day} />
          <PeriodCard item={periods.week} />
          <PeriodCard item={periods.month} />
        </div>
      ) : null}

      <p className="mt-3 text-xs text-tg-hint">
        {mode === "day"
          ? "График по дням: выше линии — перебор, ниже — недобор относительно дневной цели."
          : "График по неделям: суммарный перебор/недобор за неделю."}
      </p>

      {!series.length ? (
        <p className="mt-4 text-xs text-tg-hint">Пока нет данных питания за период.</p>
      ) : (
        <div className="mt-3">
          <div className="relative flex h-40 items-stretch gap-1">
            <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-black/20" />
            {series.map((day) => {
              const delta = day.delta ?? 0;
              const height = Math.max(4, Math.round((Math.abs(delta) / maxAbs) * 48));
              const label =
                mode === "week" ? `нед. ${day.date.slice(5)}` : day.date.slice(8);
              const title = !day.hasLogs
                ? `${day.date}: нет записей`
                : day.target != null
                  ? `${day.date}: съедено ${Math.round(day.calories)} ккал, цель ${Math.round(day.target)} ккал, разница ${fmtDelta(day.delta)} ккал`
                  : `${day.date}: съедено ${Math.round(day.calories)} ккал`;
              const showValue = day.hasLogs && (mode === "week" || day.date === lastLoggedDate);
              return (
                <div
                  key={day.date}
                  className="relative flex flex-1 flex-col items-center"
                  title={title}
                >
                  <div className="flex h-full w-full flex-col">
                    <div className="flex flex-1 items-end justify-center">
                      {day.hasLogs && delta > 0 ? (
                        <div
                          className="relative w-full max-w-[18px] rounded-t bg-orange-400/85"
                          style={{ height: `${height}%` }}
                        >{showValue ? <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-orange-300">+{Math.round(delta)}</span> : null}</div>
                      ) : (
                        <div className="w-full max-w-[18px]" />
                      )}
                    </div>
                    <div className="flex flex-1 items-start justify-center">
                      {day.hasLogs && delta < 0 ? (
                        <div
                          className="relative w-full max-w-[18px] rounded-b bg-cyan-500/75"
                          style={{ height: `${height}%` }}
                        >{showValue ? <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-tg-link">{Math.round(delta)}</span> : null}</div>
                      ) : !day.hasLogs ? (
                        <div className="mt-1 h-1 w-full max-w-[18px] rounded bg-white/15" />
                      ) : (
                        <div className="w-full max-w-[18px]" />
                      )}
                    </div>
                  </div>
                  <span className="mt-1 text-[9px] text-tg-hint">{label}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-tg-hint">
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-orange-400/85" />
              перебор
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-cyan-500/75" />
              недобор
            </span>
            <span><span className="mr-1 inline-block h-1 w-2 rounded bg-white/15" />нет записи</span>
            <span>линия — цель (0)</span>
          </div>
        </div>
      )}
    </section>
  );
}
