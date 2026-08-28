import type { BodyMeasurement, BodyMeasurementField } from "@/api/bodyMeasurements";

export type MeasurementPoint = {
  date: string;
  value: number;
};

export type MeasurementComparison = {
  current: MeasurementPoint;
  previous: MeasurementPoint | null;
  delta: number | null;
  days: number | null;
};

export function measurementDaysBetween(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.round((endMs - startMs) / 86_400_000);
}

export function previousMeasurementPoint(
  items: BodyMeasurement[],
  field: BodyMeasurementField,
  beforeDate: string,
): MeasurementPoint | null {
  const item = [...items]
    .sort((left, right) => right.date.localeCompare(left.date))
    .find((candidate) => candidate.date < beforeDate && candidate[field] != null);
  return item ? { date: item.date, value: Number(item[field]) } : null;
}

export function latestMeasurementComparison(
  items: BodyMeasurement[],
  field: BodyMeasurementField,
): MeasurementComparison | null {
  const points = items
    .filter((item) => item[field] != null)
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((item) => ({ date: item.date, value: Number(item[field]) }));
  const current = points.at(-1);
  if (!current) return null;
  const previous = points.at(-2) ?? null;
  return {
    current,
    previous,
    delta: previous == null ? null : Math.round((current.value - previous.value) * 10) / 10,
    days: previous == null ? null : measurementDaysBetween(previous.date, current.date),
  };
}

export function shortMeasurementDate(value: string): string {
  const [, month, day] = value.split("-");
  return `${day}.${month}`;
}
