import { Link } from "react-router-dom";

import type { BodyMeasurement, BodyMeasurementField } from "@/api/bodyMeasurements";
import { BODY_MEASURE_FIELDS } from "@/utils/energyTargets";

type Props = {
  items: BodyMeasurement[];
  error?: string | null;
};

function formatValue(value: number | null | undefined, unit: string): string {
  return value == null ? "—" : `${String(value).replace(".", ",")} ${unit}`;
}

function formatDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
  unit: string,
) {
  if (current == null || previous == null) return null;
  const value = Math.round((current - previous) * 10) / 10;
  return `${value > 0 ? "+" : ""}${String(value).replace(".", ",")} ${unit}`;
}

export function BodyMeasurementsSummary({ items, error }: Props) {
  const latest = items.at(-1) ?? null;
  const previous = items.length > 1 ? items.at(-2) ?? null : null;
  const featured = BODY_MEASURE_FIELDS.filter((field) =>
    ["weight_kg", "waist_cm", "chest_cm", "hips_cm"].includes(field.key),
  );

  return (
    <section className="rounded-2xl bg-tg-secondary p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Замеры тела</h2>
          <p className="mt-0.5 text-[11px] text-tg-hint">
            {latest ? `Последняя запись · ${latest.date.split("-").reverse().join(".")}` : "История обхватов"}
          </p>
        </div>
        <Link to="/measurements" className="text-xs font-medium text-tg-link">Открыть →</Link>
      </div>
      {error ? <p className="mt-3 text-xs text-tg-hint">{error}</p> : null}
      {!error && !latest ? (
        <p className="mt-3 text-xs text-tg-hint">Добавьте первый замер, чтобы видеть изменения.</p>
      ) : null}
      {latest ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {featured.map((field) => {
            const key = field.key as BodyMeasurementField;
            const delta = formatDelta(latest[key], previous?.[key], field.unit);
            return (
              <div key={field.key} className="rounded-xl bg-tg-bg p-2.5">
                <p className="text-[10px] text-tg-hint">{field.label.split(",")[0]}</p>
                <p className="mt-1 text-base font-semibold tabular-nums">{formatValue(latest[key], field.unit)}</p>
                <p className="text-[10px] text-tg-hint">{delta ? `к прошлому ${delta}` : "нет сравнения"}</p>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
