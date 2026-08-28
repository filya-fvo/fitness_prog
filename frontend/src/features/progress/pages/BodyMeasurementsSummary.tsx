import { useState } from "react";
import { Link } from "react-router-dom";

import type {
  BodyMeasurementAnalyticsItem,
  BodyMeasurementPeriod,
} from "@/api/bodyMeasurements";
import { useBodyMeasurementAnalytics } from "@/features/progress/hooks/useBodyMeasurementAnalytics";
import { BODY_MEASURE_FIELDS } from "@/utils/energyTargets";

const PERIODS: BodyMeasurementPeriod[] = [1, 3, 6, 12];
const FEATURED_FIELDS = new Set(["weight_kg", "waist_cm", "chest_cm", "hips_cm"]);

const GOAL_LABELS: Record<string, string> = {
  lose_fat: "снижение жировой массы",
  gain_muscle: "набор мышечной массы",
  maintain: "поддержание формы",
};

function numberText(value: number): string {
  return String(value).replace(".", ",");
}

function signedText(value: number, unit: string): string {
  return `${value > 0 ? "+" : ""}${numberText(value)} ${unit}`;
}

function shortDate(value: string | null): string {
  return value ? value.split("-").reverse().slice(0, 2).join(".") : "—";
}

function MeasurementAnalyticsCard({ item }: { item: BodyMeasurementAnalyticsItem }) {
  const config = BODY_MEASURE_FIELDS.find((field) => field.key === item.field);
  if (!config || item.latest_value == null) return null;
  return (
    <div className="rounded-xl bg-tg-bg p-2.5">
      <p className="text-[10px] text-tg-hint">{config.label.split(",")[0]}</p>
      <p className="mt-1 text-base font-semibold tabular-nums">
        {numberText(item.latest_value)} {config.unit}
      </p>
      {item.baseline_value != null && item.baseline_date ? (
        <p className="text-[10px] text-tg-hint">
          База {shortDate(item.baseline_date)}: {numberText(item.baseline_value)} {config.unit}
        </p>
      ) : null}
      {item.delta != null ? (
        <p className="mt-1 text-[11px] tabular-nums">
          {signedText(item.delta, config.unit)}
          {item.percent_change != null ? ` · ${signedText(item.percent_change, "%")}` : ""}
        </p>
      ) : null}
      {item.target_value != null ? (
        <p className="mt-1 text-[10px] text-tg-hint">
          Цель: {numberText(item.target_value)} {config.unit}
          {item.target_gap != null ? ` · разница ${signedText(item.target_gap, config.unit)}` : ""}
        </p>
      ) : null}
      <p className="mt-1 text-[10px] text-tg-hint">{item.interpretation}</p>
    </div>
  );
}

export function BodyMeasurementsSummary() {
  const [months, setMonths] = useState<BodyMeasurementPeriod>(3);
  const { data, loading, error } = useBodyMeasurementAnalytics(months);
  const items = (data?.items ?? []).filter((item) => FEATURED_FIELDS.has(item.field));
  const hasData = items.some((item) => item.latest_value != null);
  const goalLabel = data?.primary_goal ? GOAL_LABELS[data.primary_goal] : null;

  return (
    <section className="rounded-2xl bg-tg-secondary p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Замеры тела</h2>
          <p className="mt-0.5 text-[11px] text-tg-hint">База и изменение за период</p>
        </div>
        <Link to="/measurements" className="text-xs font-medium text-tg-link">Открыть →</Link>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1" aria-label="Период аналитики замеров">
        {PERIODS.map((period) => (
          <button
            key={period}
            type="button"
            onClick={() => setMonths(period)}
            aria-pressed={months === period}
            className={`min-h-11 rounded-lg px-2 text-xs ${months === period ? "bg-tg-button text-tg-button-text" : "bg-tg-bg text-tg-hint"}`}
          >
            {period} мес.
          </button>
        ))}
      </div>
      {goalLabel ? (
        <p className="mt-2 text-[10px] text-tg-hint">
          Цель профиля: {goalLabel}. Обхваты оцениваются нейтрально.
        </p>
      ) : null}
      {loading ? <p className="mt-3 text-xs text-tg-hint">Загружаем аналитику…</p> : null}
      {error ? <p className="mt-3 text-xs text-tg-hint">{error}</p> : null}
      {!loading && !error && !hasData ? (
        <p className="mt-3 text-xs text-tg-hint">
          За этот период замеров нет. Выберите больший период или добавьте запись.
        </p>
      ) : null}
      {hasData ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {items.map((item) => <MeasurementAnalyticsCard key={item.field} item={item} />)}
        </div>
      ) : null}
    </section>
  );
}
