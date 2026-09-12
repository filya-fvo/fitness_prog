type WorkoutRecencyInput = {
  today: string;
  cachedLastCompletedDate?: string | null;
  serverLastCompletedDate?: string | null;
};

function dateKeyTimestamp(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function workoutPauseDays(input: WorkoutRecencyInput): number | null {
  const todayTimestamp = dateKeyTimestamp(input.today);
  if (todayTimestamp == null) return null;

  const candidates = [input.cachedLastCompletedDate, input.serverLastCompletedDate]
    .map(dateKeyTimestamp)
    .filter((value): value is number => value != null && value <= todayTimestamp);
  if (!candidates.length) return null;

  const latestTimestamp = Math.max(...candidates);
  return Math.max(0, Math.round((todayTimestamp - latestTimestamp) / 86_400_000));
}
