import { useEffect, useMemo, useState } from "react";

import { getStoredToken } from "@/api/client";
import { fetchWorkoutHistory } from "@/api/workouts";
import { readCachedWorkouts } from "@/db/syncQueue";
import { ExerciseProgressChart } from "@/features/workout/components/ExerciseProgressChart";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import type { Workout } from "@/types/workout";
import { buildExerciseDiary, buildExerciseProgress } from "@/utils/exerciseProgress";
import { isOnline } from "@/utils/network";

const PHASE_LABELS = { light: "Лёгкая", medium: "Средняя", heavy: "Тяжёлая", unknown: "Без фазы" } as const;

function displayDate(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(`${iso}T12:00:00`));
}

function ChartIcon() {
  return <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 16V9m5 7V5m5 11v-4m4 4V2" strokeLinecap="round" /></svg>;
}

export function ExerciseProgressSection({ exerciseId, exerciseName }: { exerciseId: string; exerciseName: string }) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartOpen, setChartOpen] = useState(false);
  const chartDialogRef = useModalAccessibility(chartOpen, () => setChartOpen(false));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const cached = await readCachedWorkouts();
        if (!cancelled) setWorkouts(cached);
        if (getStoredToken() && isOnline()) {
          const fresh = await fetchWorkoutHistory();
          if (!cancelled) setWorkouts(fresh);
        }
      } catch {
        if (!cancelled) setError("Не удалось обновить историю");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [exerciseId]);

  const diary = useMemo(() => buildExerciseDiary(workouts, exerciseId, 1), [exerciseId, workouts]);
  const points = useMemo(() => buildExerciseProgress(workouts, exerciseId), [exerciseId, workouts]);
  const latest = diary[0] ?? null;

  return (
    <section className="mt-3 rounded-xl border border-white/5 bg-tg-secondary p-3">
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-sm font-semibold">Дневник</p><p className="mt-0.5 text-[11px] text-tg-hint">Последнее выполнение</p></div>
        <button type="button" onClick={() => setChartOpen(true)} disabled={!points.length} className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-tg-bg px-3 text-xs font-semibold text-tg-link disabled:opacity-45">
          Динамика веса <ChartIcon />
        </button>
      </div>
      {loading && !workouts.length ? <div className="mt-3 h-20 animate-pulse rounded-xl bg-tg-bg" /> : null}
      {!loading && !latest ? <p className="mt-3 rounded-xl bg-tg-bg p-3 text-xs text-tg-hint">История появится после завершённого подхода с весом.</p> : null}
      {latest ? <div className="mt-3">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs">
          <span className="font-medium">{displayDate(latest.date)}</span>
          <span className="rounded-full bg-tg-bg px-2 py-1 text-tg-hint">{PHASE_LABELS[latest.phase]}</span>
        </div>
        <div className="space-y-1.5">
          {latest.sets.map((set) => <div key={set.setNumber} className="flex items-center gap-3 rounded-xl bg-tg-bg px-3 py-2.5 text-sm"><span className="w-4 text-tg-hint">{set.setNumber}</span><span className="font-semibold tabular-nums">{set.weight} кг × {set.reps} повт.</span></div>)}
        </div>
      </div> : null}
      {error ? <p className="mt-2 text-[11px] text-amber-300">{error}</p> : null}

      {chartOpen ? <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="exercise-progress-title" onClick={() => setChartOpen(false)}>
        <div ref={chartDialogRef} tabIndex={-1} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-tg-secondary p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div><h2 id="exercise-progress-title" className="text-lg font-semibold">Динамика веса</h2><p className="mt-1 text-xs text-tg-hint">{exerciseName}</p></div>
            <button type="button" onClick={() => setChartOpen(false)} className="tap-target rounded-xl bg-tg-bg px-3 text-sm text-tg-link">Закрыть</button>
          </div>
          <ExerciseProgressChart allPoints={points} />
        </div>
      </div> : null}
    </section>
  );
}
