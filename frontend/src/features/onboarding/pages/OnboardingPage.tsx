/**
 * Onboarding questionnaire — TZ §5 first launch.
 * Saves goals + anthropometry via PUT /users/me.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { updateMyProfile } from "@/api/users";
import { Header } from "@/components/layout/Header";
import { useMainButton } from "@/features/workout/hooks/useMainButton";
import { trackEvent } from "@/lib/analytics";
import { hapticNotification } from "@/lib/telegram";
import { useUserStore } from "@/store/userStore";
import {
  ACTIVITY_OPTIONS,
  previewEnergyTargets,
} from "@/utils/energyTargets";
import { isOnline } from "@/utils/network";

const GOALS = [
  { id: "lose_fat", label: "Похудение" },
  { id: "gain_muscle", label: "Набор массы" },
  { id: "maintain", label: "Поддержание" },
] as const;

const LEVELS = [
  { id: "beginner", label: "Новичок" },
  { id: "intermediate", label: "Средний" },
  { id: "advanced", label: "Продвинутый" },
] as const;

const EQUIPMENT = [
  { id: "bodyweight", label: "Свой вес" },
  { id: "dumbbells", label: "Гантели" },
  { id: "barbell", label: "Штанга" },
  { id: "machines", label: "Тренажёры" },
  { id: "bands", label: "Резинки" },
] as const;

const DAYS_PER_WEEK = [2, 3, 4, 5, 6] as const;

const SEX_OPTIONS = [
  { id: "male", label: "Мужской" },
  { id: "female", label: "Женский" },
] as const;

function defaultAdjPct(goal: string): string {
  if (goal === "lose_fat") return "-15";
  if (goal === "gain_muscle") return "10";
  return "0";
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const setUser = useUserStore((s) => s.setUser);
  const user = useUserStore((s) => s.user);

  const [step, setStep] = useState(0);
  const [primaryGoal, setPrimaryGoal] = useState<string>("maintain");
  const [level, setLevel] = useState<string>("beginner");
  const [equipment, setEquipment] = useState<string[]>(["bodyweight"]);
  const [daysPerWeek, setDaysPerWeek] = useState<number>(3);
  const [sex, setSex] = useState("male");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [age, setAge] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [activity, setActivity] = useState("moderate");
  const [adjPct, setAdjPct] = useState("0");
  const [limitations, setLimitations] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const energyPreview = useMemo(
    () =>
      previewEnergyTargets({
        sex,
        weightKg: Number(weight) || null,
        heightCm: Number(height) || null,
        age: Number(age) || null,
        birthDate: birthDate || null,
        activityLevel: activity,
        daysPerWeek,
        primaryGoal,
        calorieAdjustmentPct: Number(adjPct),
      }),
    [activity, adjPct, age, birthDate, daysPerWeek, height, primaryGoal, sex, weight],
  );

  const canNext = useMemo(() => {
    if (step === 0) return Boolean(primaryGoal);
    if (step === 1) return Boolean(level);
    if (step === 2) return equipment.length > 0;
    if (step === 3) return daysPerWeek >= 2 && daysPerWeek <= 6;
    if (step === 4) {
      const w = Number(weight);
      const h = Number(height);
      const hasAge = Number(age) > 0 || Boolean(birthDate);
      return w > 0 && h > 0 && hasAge && Boolean(sex);
    }
    return true;
  }, [age, birthDate, daysPerWeek, equipment.length, height, level, primaryGoal, sex, step, weight]);

  function toggleEquipment(id: string) {
    setEquipment((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function finish() {
    if (saving) return;
    setSaving(true);
    setError(null);
    setGenerating(true);
    try {
      const goals = {
        primary_goal: primaryGoal,
        level,
        equipment,
        days_per_week: daysPerWeek,
        activity_level: activity,
        calorie_adjustment_pct: Number(adjPct),
        limitations: limitations.trim() || null,
        onboarding_completed: true,
      };
      const anthropometry = {
        sex,
        weight_kg: Number(weight) || null,
        height_cm: Number(height) || null,
        age: Number(age) || null,
        birth_date: birthDate || null,
        activity_level: activity,
        measurements: {},
      };

      if (isOnline()) {
        const profile = await updateMyProfile({ goals, anthropometry });
        if (user) {
          setUser({
            ...user,
            id: profile.id,
            telegram_id: profile.telegram_id,
            username: profile.username ?? null,
            subscription_status: profile.subscription_status,
            onboarding_completed: profile.onboarding_completed,
          });
        }
      } else {
        localStorage.setItem(
          "fitness_onboarding_draft",
          JSON.stringify({ goals, anthropometry }),
        );
        if (user) {
          setUser({ ...user, onboarding_completed: true });
        }
      }

      await new Promise((r) => window.setTimeout(r, 900));
      trackEvent("onboarding_completed", {
        primary_goal: primaryGoal,
        level,
        days_per_week: daysPerWeek,
        calorie_adjustment_pct: Number(adjPct),
        offline: !isOnline(),
      });
      hapticNotification("success");
      navigate("/programs", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить анкету");
      setGenerating(false);
    } finally {
      setSaving(false);
    }
  }

  useMainButton({
    text:
      step < 5
        ? "Далее"
        : generating
          ? "AI составляет программу…"
          : "Завершить",
    visible: true,
    enabled: canNext && !saving,
    onClick: () => {
      if (step < 5) {
        setStep((s) => s + 1);
        return;
      }
      void finish();
    },
  });

  if (generating && step >= 5) {
    return (
      <section>
        <Header title="Онбординг" subtitle="Почти готово" />
        <div className="rounded-2xl bg-tg-secondary p-6 text-center">
          <p className="text-sm font-medium">AI составляет вашу первую программу…</p>
          <p className="mt-2 text-xs text-tg-hint">
            Учтём цель, уровень, оборудование и {daysPerWeek} дн./нед.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <Header title="Онбординг" subtitle={`Шаг ${step + 1} из 6`} />
      {error ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}

      {step === 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Ваша цель</p>
          {GOALS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setPrimaryGoal(g.id);
                setAdjPct(defaultAdjPct(g.id));
              }}
              className={[
                "w-full rounded-xl px-4 py-3 text-left text-sm",
                primaryGoal === g.id ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary",
              ].join(" ")}
            >
              {g.label}
            </button>
          ))}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Уровень</p>
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLevel(l.id)}
              className={[
                "w-full rounded-xl px-4 py-3 text-left text-sm",
                level === l.id ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary",
              ].join(" ")}
            >
              {l.label}
            </button>
          ))}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Оборудование</p>
          {EQUIPMENT.map((e) => {
            const on = equipment.includes(e.id);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => toggleEquipment(e.id)}
                className={[
                  "w-full rounded-xl px-4 py-3 text-left text-sm",
                  on ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary",
                ].join(" ")}
              >
                {e.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Сколько дней в неделю готовы тренироваться?</p>
          {DAYS_PER_WEEK.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDaysPerWeek(d)}
              className={[
                "w-full rounded-xl px-4 py-3 text-left text-sm",
                daysPerWeek === d ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary",
              ].join(" ")}
            >
              {d} дн./нед.
            </button>
          ))}
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-3 rounded-2xl bg-tg-secondary p-4">
          <p className="text-sm font-medium">Антропометрия и калории</p>
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
            % к TDEE (дефицит / профицит)
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
          {energyPreview.complete ? (
            <p className="text-xs text-tg-hint">
              Цель ≈ {energyPreview.caloriesTarget} ккал (BMR {energyPreview.bmr}, TDEE{" "}
              {energyPreview.tdee})
            </p>
          ) : (
            <p className="text-xs text-tg-hint">
              Укажите вес, рост и возраст/дату рождения — посчитаем калории.
            </p>
          )}
          <p className="text-[11px] text-tg-hint">
            Обхваты (шея, талия и т.д.) можно добавить позже в профиле.
          </p>
        </div>
      ) : null}

      {step === 5 ? (
        <div className="space-y-3">
          <label className="block rounded-2xl bg-tg-secondary p-4 text-sm">
            Ограничения по здоровью (опционально)
            <textarea
              value={limitations}
              onChange={(e) => setLimitations(e.target.value)}
              rows={4}
              className="mt-2 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
              placeholder="Например: колени, поясница…"
            />
          </label>
          <button
            type="button"
            disabled={!canNext || saving}
            onClick={() => void finish()}
            className="w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-60"
          >
            Сохранить и продолжить
          </button>
        </div>
      ) : null}

      {step > 0 && step < 5 ? (
        <button
          type="button"
          className="mt-4 w-full text-center text-xs text-tg-link"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          Назад
        </button>
      ) : null}
    </section>
  );
}
