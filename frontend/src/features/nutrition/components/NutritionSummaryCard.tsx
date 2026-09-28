import { useState } from "react";
import { Link } from "react-router-dom";

import type { DailyNutrition } from "@/api/nutrition";
import { AppCard } from "@/components/ui/AppCard";

type Props = {
  day: string;
  isToday: boolean;
  totals: DailyNutrition["totals"];
  targets: DailyNutrition["targets"];
  onPrevious: () => void;
  onToday: () => void;
  onNext: () => void;
};

const macros = [
  { key: "proteins", goal: "proteins_g", label: "Белки", color: "#21c8e5" },
  { key: "fats", goal: "fats_g", label: "Жиры", color: "#f2b84b" },
  { key: "carbs", goal: "carbs_g", label: "Углеводы", color: "#a784ff" },
] as const;

function progress(value: number, goal: number | null | undefined): number {
  return goal && goal > 0 ? Math.min(100, Math.max(0, Math.round(value / goal * 100))) : 0;
}

function dayHeading(day: string, isToday: boolean): string {
  const [year, month, date] = day.split("-").map(Number);
  const display = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(
    new Date(year, month - 1, date),
  );
  return isToday ? `Сегодня, ${display}` : display;
}

export function NutritionSummaryCard({ day, isToday, totals, targets, onPrevious, onToday, onNext }: Props) {
  const [goalDetailsOpen, setGoalDetailsOpen] = useState(true);
  const goal = targets?.complete ? targets.calories_target : null;
  const eaten = Math.round(totals.calories);
  const remaining = goal == null ? null : Math.round(goal - totals.calories);
  const calorieProgress = progress(totals.calories, goal);
  const adjustment = targets?.calorie_adjustment_pct;
  const goalReason = targets?.formula === "manual"
    ? "Цель задана вручную в профиле."
    : adjustment == null
      ? null
      : adjustment < 0
        ? `Цель учитывает дефицит ${Math.abs(adjustment)}% от расхода с активностью.`
        : adjustment > 0
          ? `Цель учитывает профицит ${adjustment}% к расходу с активностью.`
          : "Цель равна расходу с активностью, без дефицита и профицита.";

  return (
    <AppCard tone="hero" className="nutrition-summary-card" role="region" aria-label="Итоги питания за день">
      <div className="nutrition-summary-date">
        <button type="button" aria-label="Предыдущий день" onClick={onPrevious}>‹</button>
        <button type="button" onClick={onToday} className="nutrition-summary-date-label">
          {dayHeading(day, isToday)}
        </button>
        <button type="button" aria-label="Следующий день" disabled={isToday} onClick={onNext}>›</button>
      </div>

      <div className="nutrition-summary-energy">
        <div className="nutrition-summary-side">
          <strong>{goal == null ? "—" : Math.round(goal).toLocaleString("ru-RU")}</strong>
          <span>цель</span>
        </div>
        <div
          className="nutrition-summary-ring"
          role="meter"
          aria-label="Калории за день"
          aria-valuemin={0}
          aria-valuemax={goal ?? Math.max(eaten, 1)}
          aria-valuenow={eaten}
          style={{ background: `conic-gradient(#21c8e5 ${calorieProgress}%, rgba(255,255,255,.35) ${calorieProgress}%)` }}
        >
          <div className="nutrition-summary-ring-center">
            <strong>{eaten.toLocaleString("ru-RU")}</strong>
            <span>ккал</span>
          </div>
        </div>
        <div className="nutrition-summary-side">
          <strong>{remaining == null ? "—" : Math.abs(remaining).toLocaleString("ru-RU")}</strong>
          <span>{remaining != null && remaining < 0 ? "сверх цели" : "осталось"}</span>
        </div>
      </div>

      <div className="nutrition-summary-macros">
        {macros.map(({ key, goal: goalKey, label, color }) => {
          const value = Math.round(totals[key]);
          const target = targets?.complete ? targets.macros?.[goalKey] : null;
          return (
            <div key={key} className="nutrition-summary-macro">
              <span className="nutrition-summary-macro-label">{label}</span>
              <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={target ?? Math.max(value, 1)} aria-valuenow={value} className="nutrition-summary-macro-track">
                <span style={{ width: `${progress(value, target)}%`, background: color }} />
              </div>
              <span className="nutrition-summary-macro-value">{value} / {target == null ? "—" : Math.round(target)} г</span>
            </div>
          );
        })}
      </div>

      {!targets?.complete ? (
        <Link to="/profile" className="nutrition-summary-profile-link">Заполните профиль, чтобы увидеть свою цель</Link>
      ) : goalReason ? (
        <div className="nutrition-summary-details">
          <button type="button" onClick={() => setGoalDetailsOpen((open) => !open)}>
            {goalDetailsOpen ? "Скрыть расчёт цели" : "Как рассчитана цель"}
          </button>
          {goalDetailsOpen ? <p>
            {targets.bmr && targets.tdee ? <>
              Основной обмен: {targets.bmr} ккал · расход с активностью: {targets.tdee} ккал.<br />
            </> : null}
            {goalReason}
          </p> : null}
        </div>
      ) : null}
      <div className="nutrition-summary-links">
        <Link to="/measurements">Замеры и баланс</Link>
        <Link to="/knowledge">Гид по питанию ↗</Link>
      </div>
    </AppCard>
  );
}
