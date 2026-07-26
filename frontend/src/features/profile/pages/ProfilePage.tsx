/**
 * Profile: body metrics, active program, supplements, notification schedule.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getStoredToken } from "@/api/client";
import {
  dispatchMyDueNotifications,
  fetchNotificationSettings,
  saveNotificationSettings,
} from "@/api/notifications";
import { fetchPrograms } from "@/api/programs";
import {
  addCustomSupplement,
  addSupplementFromCatalog,
  fetchSupplementStack,
  removeSupplement,
  saveSupplementStack,
  type SupplementCatalogItem,
  type SupplementEntry,
} from "@/api/supplements";
import {
  requestEmailLinkCode,
  verifyEmailLinkCode,
} from "@/api/auth";
import { fetchMyProfile, updateMyProfile } from "@/api/users";
import { useUserStore } from "@/store/userStore";
import { Header } from "@/components/layout/Header";
import {
  ACTIVITY_OPTIONS,
  BODY_MEASURE_FIELDS,
  previewEnergyTargets,
} from "@/utils/energyTargets";
import { isOnline } from "@/utils/network";
import type { Program } from "@/types/workout";

const SEX_OPTIONS = [
  { id: "male", label: "Мужской" },
  { id: "female", label: "Женский" },
] as const;

const GOAL_OPTIONS = [
  { id: "lose_fat", label: "Похудение" },
  { id: "gain_muscle", label: "Набор" },
  { id: "maintain", label: "Поддержание" },
] as const;

const WEEKDAYS = [
  { id: 0, label: "Пн" },
  { id: 1, label: "Вт" },
  { id: 2, label: "Ср" },
  { id: 3, label: "Чт" },
  { id: 4, label: "Пт" },
  { id: 5, label: "Сб" },
  { id: 6, label: "Вс" },
] as const;

type TabId = "body" | "program" | "supplements" | "alerts";

function numOrEmpty(v: unknown): string {
  if (v == null || v === "") return "";
  return String(v);
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export function ProfilePage() {
  const setUser = useUserStore((s) => s.setUser);
  const storeUser = useUserStore((s) => s.user);
  const [tab, setTab] = useState<TabId>("body");
  const [authEmail, setAuthEmail] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailStep, setEmailStep] = useState<"idle" | "code">("idle");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailDebugCode, setEmailDebugCode] = useState<string | null>(null);
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

  const [programs, setPrograms] = useState<Program[]>([]);
  const [activeProgramId, setActiveProgramId] = useState("");

  const [stack, setStack] = useState<SupplementEntry[]>([]);
  const [catalog, setCatalog] = useState<SupplementCatalogItem[]>([]);
  const [pickerKey, setPickerKey] = useState("");
  const [customName, setCustomName] = useState("");
  const [customDose, setCustomDose] = useState("");
  const [detailKey, setDetailKey] = useState<string | null>(null);

  const [tz, setTz] = useState("Europe/Moscow");
  const [measEnabled, setMeasEnabled] = useState(true);
  const [measTime, setMeasTime] = useState("10:00");
  const [measInterval, setMeasInterval] = useState("14");
  const [woEnabled, setWoEnabled] = useState(true);
  const [woTime, setWoTime] = useState("18:30");
  const [woDays, setWoDays] = useState<number[]>([0, 2, 4]);
  const [supEnabled, setSupEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!getStoredToken()) {
        setLoading(false);
        setError("Нужна авторизация");
        return;
      }
      try {
        const [p, prog, sup, nset] = await Promise.all([
          fetchMyProfile(),
          fetchPrograms({ templatesOnly: true }).catch(() => ({ items: [] as Program[] })),
          fetchSupplementStack().catch(() => ({ items: [], catalog: [] })),
          fetchNotificationSettings().catch(() => null),
        ]);
        if (cancelled) return;

        const a = asRecord(p.anthropometry);
        const g = asRecord(p.goals);
        setAuthEmail(String(p.auth_email || ""));
        setEmailDraft(String(p.auth_email || ""));
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
        setActiveProgramId(String(g.active_program_id || ""));
        const m = asRecord(a.measurements);
        const next: Record<string, string> = {};
        for (const f of BODY_MEASURE_FIELDS) next[f.key] = numOrEmpty(m[f.key]);
        setMeasures(next);

        setPrograms(prog.items || []);
        setStack(sup.items || []);
        setCatalog(sup.catalog || []);
        if (sup.catalog?.[0]) setPickerKey(sup.catalog[0].key);

        if (nset?.settings) {
          const s = asRecord(nset.settings);
          setTz(String(s.timezone || "Europe/Moscow"));
          const meas = asRecord(s.measurements);
          setMeasEnabled(meas.enabled !== false);
          setMeasTime(String(meas.time || "10:00"));
          setMeasInterval(String(meas.interval_days ?? 14));
          const wo = asRecord(s.workouts);
          setWoEnabled(wo.enabled !== false);
          setWoTime(String(wo.time || "18:30"));
          const days = Array.isArray(wo.days) ? wo.days.map((d) => Number(d)) : [0, 2, 4];
          setWoDays(days.filter((d) => d >= 0 && d <= 6));
          const su = asRecord(s.supplements);
          setSupEnabled(su.enabled !== false);
        }
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

  const catalogByKey = useMemo(() => {
    const map = new Map<string, SupplementCatalogItem>();
    for (const c of catalog) map.set(c.key, c);
    return map;
  }, [catalog]);

  const activeProgram = programs.find((p) => p.id === activeProgramId) || null;
  const unusedCatalog = catalog.filter((c) => !stack.some((s) => s.key === c.key && !s.custom));

  
  async function sendEmailCode() {
    if (emailBusy) return;
    setEmailBusy(true);
    setError(null);
    setOk(null);
    setEmailDebugCode(null);
    try {
      const res = await requestEmailLinkCode(emailDraft.trim());
      setEmailStep("code");
      setOk(res.message || "Код отправлен");
      if (res.debug_code) setEmailDebugCode(res.debug_code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить код");
    } finally {
      setEmailBusy(false);
    }
  }

  async function confirmEmailCode() {
    if (emailBusy) return;
    setEmailBusy(true);
    setError(null);
    setOk(null);
    try {
      const linked = await verifyEmailLinkCode(emailDraft.trim(), emailCode.trim());
      const nextEmail = linked.auth_email || emailDraft.trim().toLowerCase();
      setAuthEmail(nextEmail);
      setEmailDraft(nextEmail);
      setEmailStep("idle");
      setEmailCode("");
      setEmailDebugCode(null);
      if (storeUser) {
        setUser({
          ...storeUser,
          auth_email: linked.auth_email ?? storeUser.auth_email,
          telegram_id: linked.telegram_id ?? storeUser.telegram_id,
          username: linked.username ?? storeUser.username,
          onboarding_completed: linked.onboarding_completed,
        });
      }
      setOk("Email подтверждён. Можно входить через сайт по почте.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось подтвердить email");
    } finally {
      setEmailBusy(false);
    }
  }

async function saveBody() {
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
        active_program_id: activeProgramId || null,
      };
      if (isOnline() && getStoredToken()) {
        await updateMyProfile({ anthropometry, goals });
      } else {
        localStorage.setItem("fitness_profile_draft", JSON.stringify({ anthropometry, goals }));
      }
      setOk("Профиль сохранён.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  async function saveProgramOnly() {
    if (saving) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      await updateMyProfile({
        goals: {
          active_program_id: activeProgramId || null,
          days_per_week: Number(daysPerWeek) || 3,
        },
      });
      setOk(
        activeProgram
          ? `Активная программа: ${activeProgram.name}`
          : "Активная программа сброшена",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить программу");
    } finally {
      setSaving(false);
    }
  }

  async function persistStack(next: SupplementEntry[]) {
    setStack(next);
    const res = await saveSupplementStack(next);
    setStack(res.items);
    setCatalog(res.catalog);
  }

  async function saveAlerts() {
    if (saving) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const settings = {
        timezone: tz,
        measurements: {
          enabled: measEnabled,
          time: measTime,
          interval_days: Number(measInterval) || 14,
        },
        workouts: {
          enabled: woEnabled,
          time: woTime,
          days: woDays,
        },
        supplements: {
          enabled: supEnabled,
        },
      };
      await saveNotificationSettings(settings);
      // also mirror workout days into goals for other features
      await updateMyProfile({
        goals: {
          notification_settings: settings,
          workout_days: woDays,
          workout_remind_time: woTime,
        },
      });
      setOk("Уведомления сохранены. Бот пришлёт сообщения в чат по расписанию.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить уведомления");
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(d: number) {
    setWoDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "body", label: "Тело" },
    { id: "program", label: "Программа" },
    { id: "supplements", label: "Добавки" },
    { id: "alerts", label: "Уведомления" },
  ];

  return (
    <section>
      <Header title="Профиль" subtitle="Замеры, программа, добавки, напоминания" />
      {loading ? <p className="text-sm text-tg-hint">Загрузка…</p> : null}
      {error ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm">{error}</div> : null}
      {ok ? <div className="mb-3 rounded-xl bg-tg-secondary p-3 text-sm text-tg-link">{ok}</div> : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setOk(null);
              setError(null);
            }}
            className={[
              "rounded-full px-3 py-1.5 text-xs font-medium",
              tab === t.id ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "body" ? (
        <div className="space-y-4">

          <div className="space-y-2 rounded-2xl bg-tg-secondary p-4">
            <p className="text-sm font-medium">Email для входа на сайте</p>
            <p className="text-xs text-tg-hint">
              Привяжите почту, чтобы открывать приложение в браузере без Telegram. Код подтверждения придёт в Telegram (и на email, если настроен SMTP).
            </p>
            {authEmail ? (
              <p className="text-xs text-tg-link">Текущий email: {authEmail}</p>
            ) : (
              <p className="text-xs text-tg-hint">Email ещё не привязан</p>
            )}
            <label className="block text-xs text-tg-hint">
              Email
              <input
                type="email"
                autoComplete="email"
                value={emailDraft}
                onChange={(e) => {
                  setEmailDraft(e.target.value);
                  setEmailStep("idle");
                  setEmailCode("");
                }}
                className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
                placeholder="you@example.com"
              />
            </label>
            {emailStep === "code" ? (
              <label className="block text-xs text-tg-hint">
                Код подтверждения
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={emailCode}
                  onChange={(e) => setEmailCode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm tracking-widest"
                  placeholder="123456"
                  maxLength={12}
                />
              </label>
            ) : null}
            {emailDebugCode ? (
              <p className="text-xs text-tg-hint">
                Dev-code: <span className="font-mono">{emailDebugCode}</span>
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {emailStep === "idle" ? (
                <button
                  type="button"
                  disabled={emailBusy || !emailDraft.trim()}
                  onClick={() => void sendEmailCode()}
                  className="rounded-xl bg-tg-button px-3 py-2 text-xs font-semibold text-tg-button-text disabled:opacity-60"
                >
                  {emailBusy ? "Отправка…" : authEmail ? "Сменить email" : "Привязать email"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={emailBusy || emailCode.trim().length < 4}
                    onClick={() => void confirmEmailCode()}
                    className="rounded-xl bg-tg-button px-3 py-2 text-xs font-semibold text-tg-button-text disabled:opacity-60"
                  >
                    {emailBusy ? "Проверка…" : "Подтвердить код"}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-tg-bg px-3 py-2 text-xs text-tg-link"
                    onClick={() => {
                      setEmailStep("idle");
                      setEmailCode("");
                      setEmailDebugCode(null);
                    }}
                  >
                    Отмена
                  </button>
                </>
              )}
            </div>
          </div>

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
          </div>

          <div className="rounded-2xl bg-tg-secondary p-4 text-sm">
            <p className="font-medium">Расчёт (Mifflin–St Jeor)</p>
            {preview.complete ? (
              <ul className="mt-2 space-y-1 text-tg-hint">
                <li>BMR: {preview.bmr} ккал</li>
                <li>TDEE: {preview.tdee} ккал</li>
                <li>
                  Цель:{" "}
                  <span className="font-semibold text-tg-text">{preview.caloriesTarget} ккал</span>
                </li>
              </ul>
            ) : (
              <p className="mt-2 text-tg-hint">Укажите вес, рост и возраст/дату рождения.</p>
            )}
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => void saveBody()}
            className="w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-60"
          >
            {saving ? "Сохраняем…" : "Сохранить тело и калории"}
          </button>
        </div>
      ) : null}

      {tab === "program" ? (
        <div className="space-y-3">
          <div className="rounded-2xl bg-tg-secondary p-4 text-sm">
            <p className="font-medium">Активная программа</p>
            <p className="mt-1 text-xs text-tg-hint">
              Выберите программу — она будет основной на главной и в рекомендациях. Сменить можно
              в любой момент.
            </p>
            {activeProgram ? (
              <p className="mt-2 text-tg-link">Сейчас: {activeProgram.name}</p>
            ) : (
              <p className="mt-2 text-tg-hint">Программа не выбрана</p>
            )}
          </div>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setActiveProgramId("")}
              className={[
                "w-full rounded-xl px-4 py-3 text-left text-sm",
                !activeProgramId ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary",
              ].join(" ")}
            >
              Без фиксированной программы
            </button>
            {programs.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActiveProgramId(p.id)}
                className={[
                  "w-full rounded-xl px-4 py-3 text-left text-sm",
                  activeProgramId === p.id
                    ? "bg-tg-button text-tg-button-text"
                    : "bg-tg-secondary",
                ].join(" ")}
              >
                <span className="font-medium">{p.name}</span>
                <span className="mt-0.5 block text-xs opacity-80">
                  {p.workout_type}
                  {p.level ? ` · ${p.level}` : ""}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveProgramOnly()}
            className="w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-60"
          >
            Сохранить программу
          </button>
          <Link to="/programs" className="block text-center text-xs text-tg-link">
            Открыть каталог программ
          </Link>
        </div>
      ) : null}

      {tab === "supplements" ? (
        <div className="space-y-3">
          <div className="rounded-2xl bg-tg-secondary p-4 text-sm">
            <p className="font-medium">Мой стек добавок</p>
            <p className="mt-1 text-xs text-tg-hint">
              Рекомендуемые можно удалить. Добавляйте из каталога или свою. У каждой — принцип
              действия и дозировка.
            </p>
          </div>

          {stack.length === 0 ? (
            <p className="text-sm text-tg-hint">Стек пуст — добавьте из каталога ниже.</p>
          ) : (
            <ul className="space-y-2">
              {stack.map((item) => {
                const meta = catalogByKey.get(item.key);
                const open = detailKey === item.id;
                return (
                  <li key={item.id} className="rounded-2xl bg-tg-secondary p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{item.name_ru}</p>
                        <p className="text-xs text-tg-hint">
                          {item.dose || meta?.default_dose || "доза не указана"}
                          {item.times?.length ? ` · ${item.times.join(", ")}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          className="text-xs text-tg-link"
                          onClick={() => setDetailKey(open ? null : item.id)}
                        >
                          {open ? "Скрыть" : "Описание"}
                        </button>
                        <button
                          type="button"
                          className="text-xs text-red-500"
                          onClick={() => {
                            void removeSupplement(item.id)
                              .then((r) => {
                                setStack(r.items);
                                setOk(`Удалено: ${item.name_ru}`);
                              })
                              .catch((e) =>
                                setError(e instanceof Error ? e.message : "Ошибка удаления"),
                              );
                          }}
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                    {open ? (
                      <div className="mt-2 space-y-1 border-t border-black/5 pt-2 text-xs text-tg-hint">
                        {meta?.mechanism ? (
                          <p>
                            <span className="font-medium text-tg-text">Как работает: </span>
                            {meta.mechanism}
                          </p>
                        ) : null}
                        {meta?.effects ? (
                          <p>
                            <span className="font-medium text-tg-text">На что влияет: </span>
                            {meta.effects}
                          </p>
                        ) : null}
                        {meta?.dose_notes ? (
                          <p>
                            <span className="font-medium text-tg-text">Дозировка: </span>
                            {meta.dose_notes}
                          </p>
                        ) : null}
                        {item.notes ? <p>Заметка: {item.notes}</p> : null}
                        <label className="mt-2 block">
                          Доза
                          <input
                            value={item.dose}
                            onChange={(e) => {
                              const dose = e.target.value;
                              setStack((prev) =>
                                prev.map((x) => (x.id === item.id ? { ...x, dose } : x)),
                              );
                            }}
                            className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-2 py-1.5"
                          />
                        </label>
                        <label className="mt-1 block">
                          Времена (через запятую: 10:00, pre_workout)
                          <input
                            value={(item.times || []).join(", ")}
                            onChange={(e) => {
                              const times = e.target.value
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean);
                              setStack((prev) =>
                                prev.map((x) => (x.id === item.id ? { ...x, times } : x)),
                              );
                            }}
                            className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-2 py-1.5"
                          />
                        </label>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          <button
            type="button"
            className="w-full rounded-xl bg-tg-button px-4 py-2 text-sm font-semibold text-tg-button-text"
            onClick={() => {
              void persistStack(stack)
                .then(() => setOk("Стек добавок сохранён"))
                .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"));
            }}
          >
            Сохранить дозы и время
          </button>

          <div className="rounded-2xl bg-tg-secondary p-4 space-y-2">
            <p className="text-sm font-medium">Добавить из каталога</p>
            <select
              value={pickerKey}
              onChange={(e) => setPickerKey(e.target.value)}
              className="w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            >
              {unusedCatalog.length === 0 ? (
                <option value="">Все из каталога уже добавлены</option>
              ) : (
                unusedCatalog.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.name_ru}
                  </option>
                ))
              )}
            </select>
            {pickerKey && catalogByKey.get(pickerKey) ? (
              <p className="text-xs text-tg-hint">
                {catalogByKey.get(pickerKey)?.effects}
                {" · "}
                {catalogByKey.get(pickerKey)?.default_dose}
              </p>
            ) : null}
            <button
              type="button"
              disabled={!pickerKey || unusedCatalog.length === 0}
              className="w-full rounded-xl bg-tg-button px-3 py-2 text-sm text-tg-button-text disabled:opacity-50"
              onClick={() => {
                void addSupplementFromCatalog(pickerKey)
                  .then((r) => {
                    setStack(r.items);
                    setCatalog(r.catalog);
                    setOk("Добавка добавлена");
                  })
                  .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"));
              }}
            >
              Добавить выбранную
            </button>
          </div>

          <div className="rounded-2xl bg-tg-secondary p-4 space-y-2">
            <p className="text-sm font-medium">Своя добавка</p>
            <input
              placeholder="Название"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            />
            <input
              placeholder="Доза, напр. 5 г"
              value={customDose}
              onChange={(e) => setCustomDose(e.target.value)}
              className="w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={!customName.trim()}
              className="w-full rounded-xl bg-tg-button px-3 py-2 text-sm text-tg-button-text disabled:opacity-50"
              onClick={() => {
                void addCustomSupplement({
                  name_ru: customName.trim(),
                  dose: customDose,
                  times: ["10:00"],
                })
                  .then((r) => {
                    setStack(r.items);
                    setCustomName("");
                    setCustomDose("");
                    setOk("Своя добавка добавлена");
                  })
                  .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"));
              }}
            >
              Добавить свою
            </button>
          </div>
        </div>
      ) : null}

      {tab === "alerts" ? (
        <div className="space-y-3">
          <div className="rounded-2xl bg-tg-secondary p-4 text-sm">
            <p className="font-medium">Уведомления в Telegram-чат</p>
            <p className="mt-1 text-xs text-tg-hint">
              Бот пришлёт сообщение в чат. Нужны: /start у бота, Redis + worker (
              <code className="text-[10px]">arq app.tasks.notifications.WorkerSettings</code>
              ), либо ручная проверка кнопкой ниже.
            </p>
          </div>

          <label className="block rounded-2xl bg-tg-secondary p-4 text-xs text-tg-hint">
            Часовой пояс
            <input
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm text-tg-text"
            />
          </label>

          <div className="space-y-2 rounded-2xl bg-tg-secondary p-4">
            <label className="flex items-center justify-between text-sm">
              <span>Замеры тела</span>
              <input
                type="checkbox"
                checked={measEnabled}
                onChange={(e) => setMeasEnabled(e.target.checked)}
              />
            </label>
            <label className="block text-xs text-tg-hint">
              Время
              <input
                type="time"
                value={measTime}
                onChange={(e) => setMeasTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-tg-hint">
              Раз в N дней
              <input
                type="number"
                value={measInterval}
                onChange={(e) => setMeasInterval(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="space-y-2 rounded-2xl bg-tg-secondary p-4">
            <label className="flex items-center justify-between text-sm">
              <span>Дни тренировки</span>
              <input
                type="checkbox"
                checked={woEnabled}
                onChange={(e) => setWoEnabled(e.target.checked)}
              />
            </label>
            <label className="block text-xs text-tg-hint">
              Время напоминания
              <input
                type="time"
                value={woTime}
                onChange={(e) => setWoTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggleDay(d.id)}
                  className={[
                    "rounded-full px-3 py-1 text-xs",
                    woDays.includes(d.id)
                      ? "bg-tg-button text-tg-button-text"
                      : "bg-tg-bg",
                  ].join(" ")}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-tg-secondary p-4">
            <label className="flex items-center justify-between text-sm">
              <span>Приём добавок</span>
              <input
                type="checkbox"
                checked={supEnabled}
                onChange={(e) => setSupEnabled(e.target.checked)}
              />
            </label>
            <p className="mt-2 text-xs text-tg-hint">
              Времена берутся из вкладки «Добавки» (например 10:00 или pre_workout относительно
              времени тренировки).
            </p>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => void saveAlerts()}
            className="w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-60"
          >
            Сохранить уведомления
          </button>
          <button
            type="button"
            className="w-full rounded-xl bg-tg-secondary px-4 py-2 text-sm"
            onClick={() => {
              void dispatchMyDueNotifications()
                .then((r) => setOk(`Проверка: отправлено ${r.sent}`))
                .catch((e) => setError(e instanceof Error ? e.message : "Ошибка dispatch"));
            }}
          >
            Проверить сейчас (due window)
          </button>
        </div>
      ) : null}

      <Link to="/nutrition" className="mt-4 block text-center text-xs text-tg-link">
        К дневнику питания
      </Link>
    </section>
  );
}
