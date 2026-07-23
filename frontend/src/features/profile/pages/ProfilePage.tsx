/**
 * Profile: anthropometry, body measurements, calorie deficit/surplus.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getStoredToken } from "@/api/client";
import { fetchMyProfile, updateMyProfile } from "@/api/users";
import { Header } from "@/components/layout/Header";
import {
  ACTIVITY_OPTIONS,
  BODY_MEASURE_FIELDS,
  previewEnergyTargets,
} from "@/utils/energyTargets";
import { isOnline } from "@/utils/network";

const SEX_OPTIONS = [
  { id: "male", label: "Мужской" },
  { id: "female", label: "Женский" },
] as const;

const GOAL_OPTIONS = [
  { id: "lose_fat", label: "Похудение" },
  { id: "gain_muscle", label: "Набор" },
  { id: "maintain", label: "Поддержание" },
] as const;

function numOrEmpty(v: unknown): string {
  if (v == null || v === "") return "";
  return String(v);
}

export function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [sex, setSex] = useState("male");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [age, setAge] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [activity, setActivity] = useState("moderate");
  const [primaryGoal, setPrimaryGoal] = useState("maintain");
  const [adjPct, setAdjPct] = useState("0");
  const [daysPerWeek, setDaysPerWeek] = useState("3");
  const [measures, setMeasures] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!getStoredToken()) {
        setLoading(false);
        setError("Нужна авторизация");
        return;
      }
      try {
        const p = await fetchMyProfile();
        if (cancelled) return;
        const a = (p.anthropometry || {}) as Record<string, unknown>;
        const g = (p.goals || {}) as Record<string, unknown>;
        setSex(String(a.sex || g.sex || "male"));
        setWeight(numOrEmpty(a.weight_kg));
        setHeight(numOrEmpty(a.height_cm));
        setAge(numOrEmpty(a.age));
        setBirthDate(String(a.birth_date || "").slice(0, 10));
        setActivity(String(g.activity_level || a.activity_level || "moderate"));
        setPrimaryGoal(String(g.primary_goal || "maintain"));
        setAdjPct(
          numOrEmpty(
            g.calorie_adjustment_pct ??
              (g.primary_goal === "lose_fat" ? -15 : g.primary_goal === "gain_muscle" ? 10 : 0),
          ),
        );
        setDaysPerWeek(numOrEmpty(g.days_per_week || 3));
        const m = (a.measurements as Record<string, unknown>) || {};
        const next: Record<string, string> = {};
        for (const f of BODY_MEASURE_FIELDS) {
          next[f.key] = numOrEmpty(m[f.key]);
        }
        setMeasures(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Ошибка загрузки");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const preview = useMemo(
    () =>
      previewEnergyTargets({
        sex,
        weightKg: Number(weight) || null,
        heightCm: Number(height) || null,
        age: Number(age) || null,
        birthDate: birthDate || null,
        activityLevel: activity,
        daysPerWeek: Number(daysPerWeek) || null,
        primaryGoal,
        calorieAdjustmentPct: Number(adjPct),
      }),
    [activity, adjPct, age, birthDate, daysPerWeek, height, primaryGoal, sex, weight],
  );

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const measurements: Record<string, number> = {};
      for (const [k, v] of Object.entries(measures)) {
        const n = Number(v);
        if (n > 0) measurements[k] = n;
      }
      const anthropometry = {
        sex,
        weight_kg: Number(weight) || null,
        height_cm: Number(height) || null,
        age: Number(age) || null,
        birth_date: birthDate || null,
        activity_level: activity,
        measurements,
        measurements_updated_at: new Date().toISOString(),
      };
      const goals = {
        primary_goal: primaryGoal,
        activity_level: activity,
        calorie_adjustment_pct: Number(adjPct),
        days_per_week: Number(daysPerWeek) || 3,
      };
      if (isOnline() && getStoredToken()) {
        await updateMyProfile({ anthropometry, goals });
      } else {
        localStorage.setItem(
          "fitness_profile_draft",
          JSON.stringify({ anthropometry, goals }),
        );
      }
      setOk("Сохранено. Цели калорий пересчитаны.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <Header title="Профиль" subtitle="Замеры, возраст, калорийность" />
      {loading ? <p className="text-sm text-tg-hint">Загрузка…</p> : null}
      {error ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}
      {ok ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm text-tg-link">{ok}</div> : null}

      <div className="space-y-4">
        <div className="rounded-2xl bg-tg-secondary p-4">
          <p className="mb-2 text-sm font-medium">Пол</p>
          <div className="flex gap-2">
            {SEX_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setSex(o.id)}
                className={[
                  "flex-1 rounded-xl px-3 py-2 text-sm",
                  sex === o.id ? "bg-tg-button text-tg-button-text" : "bg-tg-bg",
                ].join(" ")}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-2xl bg-tg-secondary p-4">
          <p className="text-sm font-medium">Базовые данные</p>
          <label className="block text-xs text-tg-hint">
            Вес, кг
            <input
              type="number"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs text-tg-hint">
            Рост, см
            <input
              type="number"
              inputMode="numeric"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs text-tg-hint">
            Дата рождения
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs text-tg-hint">
            Возраст (если нет даты рождения)
            <input
              type="number"
              inputMode="numeric"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="space-y-2 rounded-2xl bg-tg-secondary p-4">
          <p className="text-sm font-medium">Замеры тела, см</p>
          <div className="grid grid-cols-2 gap-2">
            {BODY_MEASURE_FIELDS.map((f) => (
              <label key={f.key} className="block text-xs text-tg-hint">
                {f.label}
                <input
                  type="number"
                  inputMode="decimal"
                  value={measures[f.key] || ""}
                  onChange={(e) =>
                    setMeasures((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-2xl bg-tg-secondary p-4">
          <p className="text-sm font-medium">Цель и калории</p>
          <div className="flex flex-wrap gap-2">
            {GOAL_OPTIONS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setPrimaryGoal(g.id);
                  if (g.id === "lose_fat") setAdjPct("-15");
                  else if (g.id === "gain_muscle") setAdjPct("10");
                  else setAdjPct("0");
                }}
                className={[
                  "rounded-full px-3 py-1 text-xs",
                  primaryGoal === g.id ? "bg-tg-button text-tg-button-text" : "bg-tg-bg",
                ].join(" ")}
              >
                {g.label}
              </button>
            ))}
          </div>
          <label className="block text-xs text-tg-hint">
            Активность
            <select
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            >
              {ACTIVITY_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-tg-hint">
            % к TDEE (минус = дефицит, плюс = профицит)
            <input
              type="number"
              value={adjPct}
              onChange={(e) => setAdjPct(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {["-20", "-15", "-10", "0", "10", "15"].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAdjPct(v)}
                className="rounded-full bg-tg-bg px-3 py-1 text-xs"
              >
                {Number(v) > 0 ? `+${v}%` : `${v}%`}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-tg-secondary p-4 text-sm">
          <p className="font-medium">Расчёт (Mifflin–St Jeor)</p>
          {preview.complete ? (
            <ul className="mt-2 space-y-1 text-tg-hint">
              <li>BMR: {preview.bmr} ккал</li>
              <li>TDEE: {preview.tdee} ккал</li>
              <li>
                Цель: <span className="font-semibold text-tg-text">{preview.caloriesTarget} ккал</span>{" "}
                ({preview.adjustmentPct > 0 ? "+" : ""}
                {preview.adjustmentPct}%)
              </li>
              <li>
                Б/Ж/У: {preview.macros.proteins} / {preview.macros.fats} / {preview.macros.carbs} г
              </li>
            </ul>
          ) : (
            <p className="mt-2 text-tg-hint">
              Укажите вес, рост и возраст/дату рождения для расчёта.
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-60"
        >
          {saving ? "Сохраняем…" : "Сохранить профиль"}
        </button>
        <Link to="/nutrition" className="block text-center text-xs text-tg-link">
          К дневнику питания
        </Link>
      </div>
    </section>
  );
}
