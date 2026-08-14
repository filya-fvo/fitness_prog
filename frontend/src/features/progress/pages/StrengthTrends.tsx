/**
 * Key lift trends + est. 1RM cards for Progress page.
 */
import type { LiftTrend } from "@/utils/strengthProgress";
import { formatDelta } from "@/utils/strengthProgress";

function MiniSpark({ points }: { points: { est1rm: number }[] }) {
  if (points.length < 2) {
    return <div className="h-8 w-full rounded bg-tg-bg" />;
  }
  const vals = points.map((p) => p.est1rm);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const w = 120;
  const h = 32;
  const coords = vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full text-tg-link" aria-hidden>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={coords}
      />
    </svg>
  );
}

export function StrengthTrends({ trends }: { trends: LiftTrend[] }) {
  if (!trends.length) {
    return (
      <div className="rounded-2xl bg-tg-secondary p-4">
        <p className="text-sm font-semibold">Силовые тренды</p>
        <p className="mt-2 text-xs text-tg-hint">
          Появятся после нескольких завершённых тренировок с весом. Считаем лучший подход и
          ориентировочный одноповторный максимум (1ПМ) по формуле Эпли. Это расчётная оценка,
          а не рекомендация проверять максимум на практике.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-tg-secondary p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">Силовые тренды</p>
        <p className="text-[10px] text-tg-hint">Расчётный 1ПМ · формула Эпли</p>
      </div>
      <ul className="space-y-2">
        {trends.map((t) => (
          <li key={t.exerciseId} className="rounded-xl bg-tg-bg px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{t.name}</p>
                <p className="text-[11px] text-tg-hint">
                  {t.latest
                    ? `${t.latest.weight} кг × ${t.latest.reps} · расчётный 1ПМ ≈ ${t.latest.est1rm} кг`
                    : "нет данных"}
                  {t.muscleGroup ? ` · ${t.muscleGroup}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right text-[11px]">
                <p
                  className={
                    t.delta1rm != null && t.delta1rm > 0
                      ? "font-medium text-emerald-600"
                      : t.delta1rm != null && t.delta1rm < 0
                        ? "font-medium text-amber-700"
                        : "text-tg-hint"
                  }
                >
                  {formatDelta(t.delta1rm)}
                </p>
                <p className="text-tg-hint">к прошлому</p>
              </div>
            </div>
            <div className="mt-1">
              <MiniSpark points={t.points} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
