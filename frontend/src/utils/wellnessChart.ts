export type WellnessChartPoint = {
  index: number;
  x: number;
  y: number;
  value: number;
};

export type WellnessChartConnection = {
  from: WellnessChartPoint;
  to: WellnessChartPoint;
  crossesMissingDays: boolean;
};

export function buildWellnessChart(
  values: Array<number | null | undefined>,
  x: (index: number) => number,
  y: (value: number) => number,
): { points: WellnessChartPoint[]; connections: WellnessChartConnection[] } {
  const points = values.flatMap((value, index) =>
    value == null || !Number.isFinite(value)
      ? []
      : [{ index, x: x(index), y: y(value), value }],
  );
  return {
    points,
    connections: points.slice(1).map((point, index) => ({
      from: points[index],
      to: point,
      crossesMissingDays: point.index - points[index].index > 1,
    })),
  };
}
