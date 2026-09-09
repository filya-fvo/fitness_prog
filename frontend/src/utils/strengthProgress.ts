/** Shared client-side estimated 1RM calculation for one exercise chart. */

/** Epley: 1RM ≈ w * (1 + r/30). For r=1 returns w. */
export function estimate1rm(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  const r = Math.max(1, Math.min(20, Math.round(reps || 1)));
  if (r === 1) return Math.round(weight * 10) / 10;
  return Math.round(weight * (1 + r / 30) * 10) / 10;
}
