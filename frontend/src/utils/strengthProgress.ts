/**
 * Strength trends + estimated 1RM from completed workout history.
 */
import type { Exercise, Workout } from "@/types/workout";
import { workoutDateKey } from "@/utils/progress";

export type LiftPoint = {
  date: string;
  weight: number;
  reps: number;
  est1rm: number;
};

export type LiftTrend = {
  exerciseId: string;
  name: string;
  muscleGroup: string | null;
  points: LiftPoint[];
  latest: LiftPoint | null;
  previous: LiftPoint | null;
  deltaKg: number | null;
  delta1rm: number | null;
};

/** Epley: 1RM ≈ w * (1 + r/30). For r=1 returns w. */
export function estimate1rm(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  const r = Math.max(1, Math.min(20, Math.round(reps || 1)));
  if (r === 1) return Math.round(weight * 10) / 10;
  return Math.round(weight * (1 + r / 30) * 10) / 10;
}

function bestSetInWorkout(
  workout: Workout,
  exerciseId: string,
): { weight: number; reps: number } | null {
  let best: { weight: number; reps: number; score: number } | null = null;
  for (const s of workout.sets || []) {
    if (s.exercise_id !== exerciseId || !s.is_completed) continue;
    const w = Number(s.weight) || 0;
    const r = Number(s.reps) || 0;
    if (w <= 0 || r <= 0) continue;
    const score = estimate1rm(w, r);
    if (!best || score > best.score || (score === best.score && w > best.weight)) {
      best = { weight: w, reps: r, score };
    }
  }
  if (!best) return null;
  return { weight: best.weight, reps: best.reps };
}

/** Prefer compound / popular lifts by name heuristics when ranking. */
function compoundBoost(name: string): number {
  const n = name.toLowerCase();
  let s = 0;
  if (/жим|присед|тяга|станова|выпад|подтягив|отжиман|румын|hip|thrust|гребл/.test(n)) s += 3;
  if (/гантел|штан|тр.?наж/.test(n)) s += 1;
  if (/растяж|мобил|планка|скручив|кардио|эллипс|бег|прыж/.test(n)) s -= 5;
  return s;
}

/**
 * Build trends for top N lifts that appear most often with loaded sets.
 * Names resolved via catalog map when available.
 */
export function buildLiftTrends(
  workouts: Workout[],
  catalog: Exercise[] = [],
  limit = 6,
): LiftTrend[] {
  const nameById = new Map(catalog.map((e) => [e.id, e]));
  const completed = workouts
    .filter((w) => w.status === "completed")
    .slice()
    .sort((a, b) => {
      const da = workoutDateKey(a) || "";
      const db = workoutDateKey(b) || "";
      return da.localeCompare(db);
    });

  const freq = new Map<string, number>();
  for (const w of completed) {
    const seen = new Set<string>();
    for (const s of w.sets || []) {
      if (!s.is_completed || !(Number(s.weight) > 0) || !(Number(s.reps) > 0)) continue;
      if (seen.has(s.exercise_id)) continue;
      seen.add(s.exercise_id);
      freq.set(s.exercise_id, (freq.get(s.exercise_id) || 0) + 1);
    }
  }

  const ranked = [...freq.entries()]
    .map(([id, count]) => {
      const ex = nameById.get(id);
      const name = ex?.name_ru || id.slice(0, 8);
      return { id, count, name, boost: compoundBoost(name) };
    })
    .sort((a, b) => b.count + b.boost - (a.count + a.boost) || a.name.localeCompare(b.name, "ru"))
    .slice(0, Math.max(1, limit));

  return ranked.map(({ id, name }) => {
    const ex = nameById.get(id);
    const points: LiftPoint[] = [];
    for (const w of completed) {
      const best = bestSetInWorkout(w, id);
      const date = workoutDateKey(w);
      if (!best || !date) continue;
      points.push({
        date,
        weight: best.weight,
        reps: best.reps,
        est1rm: estimate1rm(best.weight, best.reps),
      });
    }
    // keep last point per day
    const byDay = new Map<string, LiftPoint>();
    for (const p of points) byDay.set(p.date, p);
    const series = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
    const latest = series.length ? series[series.length - 1]! : null;
    const previous = series.length > 1 ? series[series.length - 2]! : null;
    return {
      exerciseId: id,
      name: ex?.name_ru || name,
      muscleGroup: ex?.muscle_group || null,
      points: series,
      latest,
      previous,
      deltaKg:
        latest && previous ? Math.round((latest.weight - previous.weight) * 10) / 10 : null,
      delta1rm:
        latest && previous ? Math.round((latest.est1rm - previous.est1rm) * 10) / 10 : null,
    };
  });
}

export function formatDelta(n: number | null, unit = "кг"): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n === 0) return `0 ${unit}`;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n} ${unit}`;
}
