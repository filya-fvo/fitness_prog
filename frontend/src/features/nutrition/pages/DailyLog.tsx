/**
 * Daily nutrition diary — TZ §5 tracker.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getStoredToken } from "@/api/client";
import {
  addNutritionLog,
  fetchDailyNutrition,
  previewKbju,
  searchProducts,
  type DailyNutrition,
  type NutritionProduct,
} from "@/api/nutrition";
import { Header } from "@/components/layout/Header";
import { isOnline } from "@/utils/network";

const MEALS = [
  { id: "breakfast", label: "Завтрак" },
  { id: "lunch", label: "Обед" },
  { id: "dinner", label: "Ужин" },
  { id: "snack", label: "Перекус" },
] as const;

type MealId = (typeof MEALS)[number]["id"];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DailyLog() {
  const [day] = useState(todayISO());
  const [data, setData] = useState<DailyNutrition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mealType, setMealType] = useState<MealId>("breakfast");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<NutritionProduct[]>([]);
  const [selected, setSelected] = useState<NutritionProduct | null>(null);
  const [grams, setGrams] = useState("100");
  const [saving, setSaving] = useState(false);

  async function reload() {
    if (!getStoredToken()) {
      setLoading(false);
      setError("Нужна авторизация для дневника питания");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const daily = await fetchDailyNutrition(day);
      setData(daily);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить дневник");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [day]);

  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    if (!q || q.length < 1 || !getStoredToken() || !isOnline()) {
      setSuggestions([]);
      return;
    }
    const t = window.setTimeout(() => {
      void searchProducts(q)
        .then((items) => {
          if (!cancelled) setSuggestions(items.slice(0, 8));
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query]);

  const preview = useMemo(() => {
    if (!selected) return null;
    const g = Number(grams);
    if (!g || g <= 0) return null;
    return previewKbju(selected, g);
  }, [grams, selected]);

  async function submit() {
    if (!selected || saving) return;
    const g = Number(grams);
    if (!g || g <= 0) {
      setError("Укажите граммовку > 0");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addNutritionLog({
        productId: selected.id,
        quantityGrams: g,
        mealType,
        date: day,
      });
      setQuery("");
      setSelected(null);
      setSuggestions([]);
      setGrams("100");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось добавить приём пищи");
    } finally {
      setSaving(false);
    }
  }

  const totals = data?.totals ?? { calories: 0, proteins: 0, fats: 0, carbs: 0 };
  const targets = data?.targets;
  const calorieGoal =
    targets?.complete && targets.calories_target ? Number(targets.calories_target) : 2200;
  const calPct = Math.min(100, Math.round((totals.calories / Math.max(1, calorieGoal)) * 100));
  const remaining = Math.round(calorieGoal - totals.calories);
  const adj = targets?.calorie_adjustment_pct;

  return (
    <section>
      <Header title="Питание" subtitle={`Дневник · ${day}`} />

      {loading ? <p className="mb-3 text-sm text-tg-hint">Загрузка…</p> : null}
      {error ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}

      <div className="mb-3 rounded-2xl bg-tg-secondary p-4">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-xs text-tg-hint">Калории сегодня</p>
            <p className="text-2xl font-semibold">{totals.calories.toFixed(0)}</p>
          </div>
          <div className="text-right text-xs text-tg-hint">
            <p>
              цель{" "}
              <span className="font-medium text-tg-text">
                {targets?.complete ? calorieGoal : "~2200"}
              </span>
            </p>
            {targets?.complete ? (
              <p className="mt-0.5">
                {remaining >= 0 ? `осталось ${remaining}` : `превышение ${Math.abs(remaining)}`}
                {adj != null ? ` · ${adj > 0 ? "+" : ""}${adj}%` : ""}
              </p>
            ) : (
              <p className="mt-0.5">
                <Link to="/profile" className="text-tg-link">
                  Заполните профиль
                </Link>{" "}
                для точной цели
              </p>
            )}
          </div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-tg-bg">
          <div className="h-full rounded-full bg-tg-button" style={{ width: `${calPct}%` }} />
        </div>
        {targets?.complete && targets.bmr && targets.tdee ? (
          <p className="mt-2 text-[11px] text-tg-hint">
            BMR {targets.bmr} · TDEE {targets.tdee}
            {targets.macros
              ? ` · цель Б/Ж/У ${targets.macros.proteins_g ?? "—"}/${targets.macros.fats_g ?? "—"}/${targets.macros.carbs_g ?? "—"} г`
              : ""}
          </p>
        ) : null}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <p className="text-tg-hint">Б</p>
            <p className="font-medium">{totals.proteins.toFixed(0)}</p>
            {targets?.macros?.proteins_g ? (
              <p className="text-[10px] text-tg-hint">/ {targets.macros.proteins_g}</p>
            ) : null}
          </div>
          <div>
            <p className="text-tg-hint">Ж</p>
            <p className="font-medium">{totals.fats.toFixed(0)}</p>
            {targets?.macros?.fats_g ? (
              <p className="text-[10px] text-tg-hint">/ {targets.macros.fats_g}</p>
            ) : null}
          </div>
          <div>
            <p className="text-tg-hint">У</p>
            <p className="font-medium">{totals.carbs.toFixed(0)}</p>
            {targets?.macros?.carbs_g ? (
              <p className="text-[10px] text-tg-hint">/ {targets.macros.carbs_g}</p>
            ) : null}
          </div>
        </div>
        <Link to="/profile" className="mt-3 block text-center text-xs text-tg-link">
          Замеры и % дефицита/профицита
        </Link>
      </div>

      <div className="mb-4 space-y-2 rounded-2xl bg-tg-secondary p-4">
        <p className="text-sm font-medium">Добавить продукт</p>
        <div className="flex flex-wrap gap-2">
          {MEALS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMealType(m.id)}
              className={[
                "rounded-lg px-3 py-1.5 text-xs",
                mealType === m.id ? "bg-tg-button text-tg-button-text" : "bg-tg-bg",
              ].join(" ")}
            >
              {m.label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          placeholder="Поиск: яблоко, курица…"
          className="w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
        />
        {suggestions.length > 0 && !selected ? (
          <ul className="max-h-40 overflow-auto rounded-lg bg-tg-bg">
            {suggestions.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-black/5"
                  onClick={() => {
                    setSelected(p);
                    setQuery(p.name_ru);
                    setSuggestions([]);
                  }}
                >
                  {p.name_ru}
                  <span className="ml-2 text-xs text-tg-hint">{p.calories} ккал/100г</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <label className="block text-xs text-tg-hint">
          Граммы
          <input
            type="number"
            inputMode="decimal"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
          />
        </label>
        {preview ? (
          <p className="text-xs text-tg-hint">
            ≈ {preview.calories} ккал · Б {preview.proteins} · Ж {preview.fats} · У {preview.carbs}
          </p>
        ) : null}
        <button
          type="button"
          disabled={!selected || saving}
          onClick={() => void submit()}
          className="w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-50"
        >
          {saving ? "Сохраняем…" : "Добавить"}
        </button>
      </div>

      <div className="space-y-3">
        {MEALS.map((m) => {
          const items = data?.meals?.[m.id] ?? [];
          return (
            <div key={m.id} className="rounded-2xl bg-tg-secondary p-4">
              <p className="text-sm font-medium">{m.label}</p>
              {items.length === 0 ? (
                <p className="mt-1 text-xs text-tg-hint">Пусто</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {items.map((item) => (
                    <li key={item.id} className="text-sm">
                      <span className="font-medium">
                        {item.product?.name_ru ?? "Продукт"} · {item.quantity_grams}г
                      </span>
                      <span className="ml-2 text-xs text-tg-hint">
                        {Number(item.calculated_kbj.calories ?? 0).toFixed(0)} ккал
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
