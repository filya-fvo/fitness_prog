import type { BodyMeasurement, BodyMeasurementField } from "@/api/bodyMeasurements";
import { ChartDataTable } from "@/components/ui/ChartDataTable";
import { BODY_MEASURE_FIELDS } from "@/utils/energyTargets";
import { shortMeasurementDate } from "@/utils/bodyMeasurementDeltas";

export function MeasurementChart({ items, field }: {
  items: BodyMeasurement[];
  field: BodyMeasurementField;
}) {
  const config = BODY_MEASURE_FIELDS.find((item) => item.key === field)!;
  const points = items
    .filter((item) => item[field] != null)
    .slice(-12)
    .map((item) => ({ date: item.date, value: Number(item[field]) }));
  const table = <ChartDataTable
    caption={`Динамика замеров: ${config.label}`}
    columns={["Дата", config.label]}
    rows={points.map((point) => ({ key: point.date, cells: [
      shortMeasurementDate(point.date), `${String(point.value).replace(".", ",")} ${config.unit}`,
    ] }))}
  />;
  if (points.length < 2) {
    return <><p className="mt-3 text-xs text-tg-hint">Для графика нужны хотя бы два замера.</p>{table}</>;
  }
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const polyline = points
    .map((point, index) => {
      const x = points.length === 1 ? 160 : 12 + (index / (points.length - 1)) * 296;
      const y = 105 - ((point.value - min) / span) * 85;
      return `${x},${y}`;
    })
    .join(" ");
  return <div className="app-metric mt-3 min-w-0 p-3">
    <svg viewBox="0 0 320 120" className="h-32 w-full" role="img" aria-label="Динамика замеров">
      <line x1="12" y1="105" x2="308" y2="105" stroke="currentColor" opacity="0.15" />
      <line x1="12" y1="62" x2="308" y2="62" stroke="currentColor" opacity="0.1" strokeDasharray="4 4" />
      <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth="3" className="text-tg-link" />
      {points.map((point, index) => {
        const [x, y] = polyline.split(" ")[index].split(",");
        return <circle key={point.date} cx={x} cy={y} r="4" fill="currentColor" className="text-tg-link">
          <title>{point.date}: {point.value} {config.unit}</title>
        </circle>;
      })}
    </svg>
    <div role="group" aria-label="Подписи графика замеров" className="text-xs text-tg-hint">
      <div className="flex justify-between gap-2 font-semibold text-tg-text">
        <span>{String(points[0].value).replace(".", ",")} {config.unit}</span>
        <span>{String(points[points.length - 1].value).replace(".", ",")} {config.unit}</span>
      </div>
      <div className="mt-1 flex justify-between gap-2">
        <span>{shortMeasurementDate(points[0].date)}</span>
        <span>{min.toFixed(1).replace(".", ",")}–{max.toFixed(1).replace(".", ",")} {config.unit}</span>
        <span>{shortMeasurementDate(points[points.length - 1].date)}</span>
      </div>
    </div>
    {table}
  </div>;
}
