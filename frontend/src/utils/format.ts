/** Pure formatting helpers (Sprint 5 unit tests). */

export function formatRestTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** Elapsed workout clock: M:SS or H:MM:SS. */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
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
