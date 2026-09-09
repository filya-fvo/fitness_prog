import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { StrengthTrendItem, StrengthTrendSets } from "@/api/strengthTrends";
import { ExercisePinButton } from "@/features/progress/components/ExercisePinButton";

type TrendSetKey = "next" | "best" | "pinned";

const TABS: { key: TrendSetKey; label: string }[] = [
  { key: "next", label: "Следующая" },
  { key: "best", label: "Лучшие" },
  { key: "pinned", label: "Мои" },
];

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
}

function TrendSpark({ item }: { item: StrengthTrendItem }) {
  if (item.points.length < 2) return <div className="h-8 rounded-lg bg-tg-secondary" />;
  const values = item.points.map((point) => point.estimated1rm);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const width = 120;
  const height = 32;
  const coordinates = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-full text-tg-link" aria-hidden>
      <polyline
        points={coordinates}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrendRow({
  item,
  showPin,
  onUnpin,
}: {
  item: StrengthTrendItem;
  showPin: boolean;
  onUnpin: (exerciseId: string) => void;
}) {
  const latest = item.latest;
  const load = latest
    ? latest.weightMode === "per_hand"
      ? `${formatNumber(latest.weight)} кг/руку × ${latest.reps}`
      : `${formatNumber(latest.totalWeight)} кг × ${latest.reps}`
    : "Пока нет результатов с весом";
  return (
    <li className="rounded-xl bg-tg-bg px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            to={`/progress/exercises?exercise=${encodeURIComponent(item.exerciseId)}`}
            className="block truncate text-sm font-semibold text-tg-text"
          >
            {item.name}
          </Link>
          <p className="mt-0.5 text-[11px] text-tg-hint">
            {load}
            {latest ? ` · 1ПМ ≈ ${formatNumber(latest.estimated1rm)} кг` : ""}
          </p>
        </div>
        {showPin ? (
          <ExercisePinButton
            exerciseId={item.exerciseId}
            initialPinned
            compact
            onChange={(pinned) => { if (!pinned) onUnpin(item.exerciseId); }}
          />
        ) : item.changePercent !== null ? (
          <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-500">
            +{formatNumber(item.changePercent)}%
          </span>
        ) : null}
      </div>
      <div className="mt-1"><TrendSpark item={item} /></div>
      <div className="mt-1 flex justify-between gap-2 text-[10px] text-tg-hint">
        <span>{item.points.length} наблюд.</span>
        <span>{item.changePercent !== null ? `изменение за 8 недель` : "нужно 3 результата"}</span>
      </div>
      {item.hasWeightModeChange ? (
        <p className="mt-1 text-[10px] text-amber-500">Режим учёта веса менялся</p>
      ) : null}
    </li>
  );
}

function emptyMessage(key: TrendSetKey, data: StrengthTrendSets): string {
  if (key === "next") {
    return data.nextWorkout
      ? "По упражнениям ближайшего занятия ещё нет истории с весом."
      : "Настройте программу и расписание — здесь появится ближайшая тренировка.";
  }
  if (key === "best") {
    return "Для устойчивого тренда нужно выполнить упражнение минимум трижды за 8 недель.";
  }
  return "Закрепите важные упражнения, чтобы держать их прогресс под рукой.";
}

export function StrengthTrendSetsCard({
  data,
  error,
}: {
  data: StrengthTrendSets | null;
  error: string | null;
}) {
  const [active, setActive] = useState<TrendSetKey>("next");
  const [hiddenPinned, setHiddenPinned] = useState<Set<string>>(() => new Set());
  useEffect(() => setHiddenPinned(new Set()), [data]);

  const items = useMemo(() => {
    if (!data) return [];
    if (active === "next") return data.nextWorkout?.items ?? [];
    if (active === "best") return data.bestImprovements;
    return data.pinned.filter((item) => !hiddenPinned.has(item.exerciseId));
  }, [active, data, hiddenPinned]);

  return (
    <section className="rounded-2xl bg-tg-secondary p-3" aria-labelledby="strength-trends-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="strength-trends-title" className="text-sm font-semibold">Силовые тренды</h2>
          <p className="mt-1 text-[11px] text-tg-hint">Лучший подход дня · расчётный 1ПМ</p>
        </div>
        <Link to="/progress/exercises" className="min-h-11 py-2 text-xs font-medium text-tg-link">
          Все упражнения
        </Link>
      </div>

      <div role="tablist" aria-label="Наборы силовых трендов" className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-tg-bg p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => setActive(tab.key)}
            className={`min-h-11 rounded-lg px-2 text-xs font-semibold ${active === tab.key ? "bg-tg-button text-tg-button-text" : "text-tg-hint"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {data && active === "next" && data.nextWorkout ? (
        <p className="mt-3 text-xs text-tg-hint">
          {formatDate(data.nextWorkout.date)} · {data.nextWorkout.title}
        </p>
      ) : active === "best" ? (
        <p className="mt-3 text-xs text-tg-hint">Устойчивый рост по трём и более тренировкам за 8 недель.</p>
      ) : active === "pinned" ? (
        <p className="mt-3 text-xs text-tg-hint">Вы сами определяете этот список.</p>
      ) : null}

      {error ? <p role="status" className="mt-3 rounded-xl bg-tg-bg p-3 text-xs text-amber-500">{error}</p> : null}
      {!data && !error ? <div className="mt-3 h-28 animate-pulse rounded-xl bg-tg-bg" /> : null}
      {data ? (
        items.length ? (
          <ul role="tabpanel" className="mt-2 space-y-2">
            {items.map((item) => (
              <TrendRow
                key={item.exerciseId}
                item={item}
                showPin={active === "pinned"}
                onUnpin={(exerciseId) => setHiddenPinned((current) => new Set(current).add(exerciseId))}
              />
            ))}
          </ul>
        ) : (
          <p role="tabpanel" className="mt-2 rounded-xl bg-tg-bg p-3 text-xs text-tg-hint">
            {emptyMessage(active, data)}
          </p>
        )
      ) : null}
    </section>
  );
}
