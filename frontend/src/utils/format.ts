/** Pure formatting helpers (Sprint 5 unit tests). */

export function formatRestTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function formatKg(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `${value.toFixed(digits)} кг`;
}

export function formatTonnage(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} т`;
  }
  return value.toFixed(0);
}
