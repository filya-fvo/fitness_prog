/**
 * Onboarding questionnaire — TZ §5 first launch.
 * Saves goals + anthropometry via PUT /users/me.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchPrograms } from "@/api/programs";
import { updateMyProfile } from "@/api/users";
import { Header } from "@/components/layout/Header";
import { DecimalInput } from "@/components/DecimalInput";
import { clearQueuedProfileUpdate, enqueueProfileUpdate } from "@/db/syncQueue";
import { useMainButton } from "@/features/workout/hooks/useMainButton";
import { toUserMessage } from "@/utils/errors";
import { trackEvent } from "@/lib/analytics";
import { getTelegramWebApp, hapticNotification, isTelegramEnvironment } from "@/lib/telegram";
import { useUserStore } from "@/store/userStore";
import {
  ACTIVITY_OPTIONS,
  ageFromBirthDate,
  birthYearFromDate,
  previewEnergyTargets,
} from "@/utils/energyTargets";
import { localDateKey } from "@/utils/loadProgression";
import { enumLabel } from "@/utils/localization";
import { isOnline } from "@/utils/network";
import { cursorGoalsPatch, readProgramCursor } from "@/utils/programProgress";
import { recommendPrograms } from "@/utils/programRecommend";

const GOALS = [
  { id: "lose_fat", label: "Похудение" },
  { id: "gain_muscle", label: "Набор массы" },
  { id: "maintain", label: "Поддержание" },
] as const;

const LEVELS = [
  { id: "beginner", label: "Новичок (только начинаю)" },
  { id: "intermediate", label: "Опытный (до 2–3 лет)" },
  { id: "advanced", label: "Продвинутый (от 3 лет)" },
] as const;

const LOCATIONS = [
  { id: "gym", label: "Фитнес-зал" },
  { id: "home", label: "Дом" },
  { id: "outdoor", label: "Улица / площадка" },
] as const;

const EQUIPMENT = [
  { id: "bodyweight", label: "Свой вес" },
  { id: "bands", label: "Резинки" },
  { id: "dumbbells", label: "Гантели" },
  { id: "barbell", label: "Штанга" },
  { id: "machines", label: "Тренажёры" },
] as const;

const JOINT_LIMITS = [
  { id: "no_knee", label: "Без нагрузки на колени" },
  { id: "no_spine", label: "Без нагрузки на позвоночник" },
  { id: "shoulder_sensitive", label: "Щадящая нагрузка на плечевые суставы" },
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
  const [location, setLocation] = useState<string>("gym");
  const [equipment, setEquipment] = useState<string[]>(["bodyweight"]);
  const [daysPerWeek, setDaysPerWeek] = useState<number>(3);
  const [sex, setSex] = useState("male");
  const [weight, setWeight] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [height, setHeight] = useState("");
  const [age, setAge] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [activity, setActivity] = useState("moderate");
  const [adjPct, setAdjPct] = useState("0");
  const [jointLimits, setJointLimits] = useState<string[]>([]);
  const [limitationsNote, setLimitationsNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const usesNativeMainButton =
    isTelegramEnvironment() && Boolean(getTelegramWebApp()?.MainButton);

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
    if (step === 2) return Boolean(location);
    if (step === 3) return equipment.length > 0;
    if (step === 4) return daysPerWeek >= 2 && daysPerWeek <= 6;
    if (step === 5) {
      const w = Number(weight);
      const h = Number(height);
      const resolvedAge = ageFromBirthDate(birthDate) ?? Number(age);
      const target = targetWeight ? Number(targetWeight) : null;
      return (
        w >= 20 &&
        w <= 500 &&
        h >= 80 &&
        h <= 250 &&
        resolvedAge >= 10 &&
        resolvedAge <= 100 &&
        (target == null || (target >= 20 && target <= 500)) &&
        Boolean(sex)
      );
    }
    return true;
  }, [
    age,
    birthDate,
    daysPerWeek,
    equipment.length,
    height,
    level,
    location,
    primaryGoal,
    sex,
    step,
    targetWeight,
    weight,
  ]);

  function toggleEquipment(id: string) {
    setEquipment((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleJointLimit(id: string) {
    setJointLimits((prev) =>
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
        location,
        equipment,
        days_per_week: daysPerWeek,
        activity_level: activity,
        calorie_adjustment_pct: Number(adjPct),
        target_weight_kg: Number(targetWeight) || null,
        limitations: jointLimits,
        limitations_note: limitationsNote.trim() || null,
        onboarding_completed: true,
      };
      const ageFromBirth = ageFromBirthDate(birthDate);
      const anthropometry = {
        sex,
        weight_kg: Number(weight) || null,
        height_cm: Number(height) || null,
        age: ageFromBirth ?? (Number(age) || null),
        birth_date: birthDate || null,
        birth_year: birthYearFromDate(birthDate),
        activity_level: activity,
        measurements: {},
      };

      let goalsToSave: Record<string, unknown> = { ...goals };

      // First-run: auto-assign best matching program so Home shows Day 1 CTA.
      if (isOnline()) {
        try {
          const { items } = await fetchPrograms({ templatesOnly: true });
          const rec = recommendPrograms(
            items,
            {
              primaryGoal,
              level,
              daysPerWeek,
              equipment,
              sex,
              location,
              limitations: jointLimits,
            },
            3,
          );
          const best = rec[0];
          if (best) {
            const today = localDateKey();
            const cur = readProgramCursor(goalsToSave, best, today);
            goalsToSave = {
              ...goalsToSave,
              ...cursorGoalsPatch(
                best.id,
                {
                  nextDayIndex: 1,
                  weekPhase: cur.weekPhase,
                  phaseSource: cur.phaseSource,
                  workoutsInPhase: 0,
                  startedAt: today,
                },
                today,
              ),
            };
          }
        } catch {
          // soft — user can pick program later
        }
      }

      if (isOnline()) {
        const profile = await updateMyProfile({
          goals: goalsToSave,
          anthropometry,
        });
        await clearQueuedProfileUpdate();
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
        await enqueueProfileUpdate({ goals: goalsToSave, anthropometry });
        if (user) {
          setUser({ ...user, onboarding_completed: true });
        }
      }

      await new Promise((r) => window.setTimeout(r, 400));
      trackEvent("onboarding_completed", {
        primary_goal: primaryGoal,
        level,
        location,
        days_per_week: daysPerWeek,
        calorie_adjustment_pct: Number(adjPct),
        offline: !isOnline(),
        active_program_assigned: Boolean(goalsToSave.active_program_id),
      });
      hapticNotification("success");
      navigate("/", { replace: true });
    } catch (err) {
      setError(toUserMessage(err, "Не удалось сохранить анкету"));
      setGenerating(false);
    } finally {
      setSaving(false);
    }
  }

  const primaryActionText =
    step < 6
      ? "Далее"
      : generating
        ? "Подбираем программы…"
        : "Завершить";

  const runPrimaryAction = () => {
    if (step < 6) {
      setStep((s) => s + 1);
      return;
    }
    void finish();
  };

  useMainButton({
    text: primaryActionText,
    visible: usesNativeMainButton,
    enabled: canNext && !saving,
    onClick: runPrimaryAction,
  });

  if (generating && step >= 6) {
    return (
      <section>
        <Header title="Онбординг" subtitle="Почти готово" />
        <div className="rounded-2xl bg-tg-secondary p-6 text-center">
          <p className="text-sm font-medium">Подбираем программы под ваш профиль…</p>
          <p className="mt-2 text-xs text-tg-hint">
            Учтём пол, место ({enumLabel(location)}), уровень, инвентарь и {daysPerWeek} дн./нед.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <Header title="Онбординг" subtitle={`Шаг ${step + 1} из 7`} />
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
          <p className="text-sm font-medium">Где будете тренироваться?</p>
          {LOCATIONS.map((loc) => (
            <button
              key={loc.id}
              type="button"
              onClick={() => {
                setLocation(loc.id);
                if (loc.id === "home" || loc.id === "outdoor") {
                  setEquipment((prev) => (prev.length ? prev : ["bodyweight"]));
                }
                if (loc.id === "gym") {
                  setEquipment((prev) =>
                    prev.includes("machines") || prev.includes("dumbbells")
                      ? prev
                      : ["machines", "dumbbells", "bodyweight"],
                  );
                }
              }}
              className={[
                "w-full rounded-xl px-4 py-3 text-left text-sm",
                location === loc.id ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary",
              ].join(" ")}
            >
              {loc.label}
            </button>
          ))}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Какой инвентарь доступен?</p>
          <p className="text-xs text-tg-hint">
            Для дома/улицы обычно: свой вес и/или резинки. Для зала — тренажёры, гантели, штанга.
          </p>
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

      {step === 4 ? (
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

      {step === 5 ? (
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
            <DecimalInput
              min={20}
              max={500}
              value={weight}
              onValueChange={setWeight}
              className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs text-tg-hint">
            Желаемый вес, кг (необязательно)
            <DecimalInput
              min={20}
              max={500}
              value={targetWeight}
              onValueChange={setTargetWeight}
              className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-[11px] leading-snug">
              ИИ сможет оценивать путь к цели только как ориентировочный диапазон, без обещания точной даты.
            </span>
          </label>
          <label className="block text-xs text-tg-hint">
            Рост, см
            <DecimalInput
              min={80}
              max={250}
              value={height}
              onValueChange={setHeight}
              className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs text-tg-hint">
            Дата рождения
            <input
              type="date"
              value={birthDate}
              max={new Date().toISOString().slice(0, 10)}
              min="1920-01-01"
              onChange={(e) => {
                const v = e.target.value;
                setBirthDate(v);
                const next = ageFromBirthDate(v);
                if (next != null) setAge(String(next));
              }}
              className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            />
          </label>
          {birthYearFromDate(birthDate) != null ? (
            <p className="text-[11px] text-tg-hint">
              Год рождения:{" "}
              <span className="font-medium text-tg-text">{birthYearFromDate(birthDate)}</span>
              {ageFromBirthDate(birthDate) != null
                ? ` · полных лет: ${ageFromBirthDate(birthDate)}`
                : ""}
            </p>
          ) : null}
          {!birthDate ? (
            <label className="block text-xs text-tg-hint">
              Возраст (если нет даты рождения)
              <input
                type="number"
                inputMode="numeric"
                min={10}
                max={100}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
              />
            </label>
          ) : (
            <button
              type="button"
              className="text-[11px] text-tg-link"
              onClick={() => setBirthDate("")}
            >
              Указать возраст вручную (без даты)
            </button>
          )}
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
            % к суточному расходу (дефицит / профицит)
            <DecimalInput
              value={adjPct}
              onValueChange={setAdjPct}
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
              Цель ≈ {energyPreview.caloriesTarget} ккал (обмен {energyPreview.bmr}, расход {energyPreview.tdee})
            </p>
          ) : (
            <p className="text-xs text-tg-hint">
              Укажите вес, рост и возраст/дату рождения — посчитаем калории.
            </p>
          )}
        </div>
      ) : null}

      {step === 6 ? (
        <div className="space-y-3">
          <div className="rounded-2xl bg-tg-secondary p-4">
            <p className="text-sm font-medium">Ограничения по суставам</p>
            <p className="mt-1 text-xs text-tg-hint">
              Можно выбрать несколько. Подберём программы с более щадящей нагрузкой.
            </p>
            <div className="mt-3 space-y-2">
              {JOINT_LIMITS.map((lim) => {
                const on = jointLimits.includes(lim.id);
                return (
                  <button
                    key={lim.id}
                    type="button"
                    onClick={() => toggleJointLimit(lim.id)}
                    className={[
                      "w-full rounded-xl px-4 py-3 text-left text-sm",
                      on ? "bg-tg-button text-tg-button-text" : "bg-tg-bg",
                    ].join(" ")}
                  >
                    {lim.label}
                  </button>
                );
              })}
            </div>
            {jointLimits.includes("shoulder_sensitive") ? (
              <p className="mt-3 text-xs leading-5 text-tg-hint">
                При боли выполняйте только комфортные движения. Программа не заменяет
                рекомендации врача или физиотерапевта.
              </p>
            ) : null}
          </div>
          <label className="block rounded-2xl bg-tg-secondary p-4 text-sm">
            Другие заметки (опционально)
            <textarea
              value={limitationsNote}
              onChange={(e) => setLimitationsNote(e.target.value)}
              rows={3}
              className="mt-2 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
              placeholder="Например: недавно была травма плеча…"
            />
          </label>
        </div>
      ) : null}

      {step > 0 && step < 6 ? (
        <button
          type="button"
          className="mt-4 w-full text-center text-xs text-tg-link"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          Назад
        </button>
      ) : null}

      {!usesNativeMainButton ? (
        <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-black/5 bg-tg-bg/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <button
            type="button"
            disabled={!canNext || saving}
            onClick={runPrimaryAction}
            className="tap-target-x w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-60"
          >
            {primaryActionText}
          </button>
        </div>
      ) : null}
    </section>
  );
}
