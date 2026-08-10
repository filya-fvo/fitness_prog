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
import { fetchMyProfile, updateMyProfile } from "@/api/users";
import { Header } from "@/components/layout/Header";
import { LinkEmailCard } from "@/features/profile/components/LinkEmailCard";
import { ExerciseDetailModal } from "@/features/workout/components/ExerciseDetailModal";
import { fetchExercises } from "@/api/exercises";
import type { Exercise } from "@/types/workout";
import { useUserStore } from "@/store/userStore";
import {
  ACTIVITY_OPTIONS,
  BODY_MEASURE_FIELDS,
  ageFromBirthDate,
  birthYearFromDate,
  previewEnergyTargets,
} from "@/utils/energyTargets";
import { isOnline } from "@/utils/network";
import type { Program } from "@/types/workout";
import {
  programDays,
  programSex,
  recommendPrograms,
} from "@/utils/programRecommend";
import { OTP_DRAFT_LINK_KEY, readOtpDraft } from "@/utils/otpDraft";

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

const SUPPLEMENT_SLOT_PRESETS: { id: string; label: string }[] = [
  { id: "pre_workout", label: "До тренировки (−45 мин)" },
  { id: "during_workout", label: "Во время тренировки" },
  { id: "post_workout", label: "После тренировки (+30 мин)" },
  { id: "09:00", label: "09:00" },
  { id: "10:00", label: "10:00" },
  { id: "12:00", label: "12:00" },
  { id: "18:00", label: "18:00" },
  { id: "21:00", label: "21:00" },
  { id: "21:30", label: "21:30" },
];

type SuppDaysMode = "every" | "workout" | "rest";
type SuppScheduleRow = { slot: string; days: SuppDaysMode };

function normalizeSuppDays(raw: unknown): SuppDaysMode {
  const v = String(raw || "every").trim().toLowerCase();
  if (v === "workout" || v === "workout_day" || v === "training" || v === "train") return "workout";
  if (
    v === "rest" ||
    v === "rest_day" ||
    v === "off" ||
    v === "non_workout" ||
    v === "no_workout" ||
    v === "recovery"
  ) {
    return "rest";
  }
  return "every";
}

function scheduleFromEntry(item: {
  times?: string[];
  schedule?: Array<{ slot?: string; days?: string }>;
}): SuppScheduleRow[] {
  const raw = item.schedule;
  if (Array.isArray(raw) && raw.length) {
    return raw
      .map((r) => {
        const slot = String(r.slot || "").trim();
        const days = normalizeSuppDays(r.days);
        return slot ? ({ slot, days } as SuppScheduleRow) : null;
      })
      .filter((x): x is SuppScheduleRow => Boolean(x));
  }
  return (item.times || [])
    .map((s) => String(s).trim())
    .filter(Boolean)
    .map((slot) => ({ slot, days: "every" as const }));
}

function formatScheduleLabel(rows: SuppScheduleRow[]): string {
  if (!rows.length) return "";
  return rows
    .map((r) => {
      const preset = SUPPLEMENT_SLOT_PRESETS.find((p) => p.id === r.slot);
      const slot = preset?.label || r.slot;
      if (r.days === "workout") return `${slot} (тренировка)`;
      if (r.days === "rest") return `${slot} (без тренировки)`;
      return slot;
    })
    .join(" · ");
}


function numOrEmpty(v: unknown): string {
  if (v == null || v === "") return "";
  return String(v);
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

const PROGRAM_TYPE_LABELS: Record<string, string> = {
  full_body: "Всё тело",
  full_body_alt: "Всё тело A/B",
  upper_lower: "Верх/низ",
  push_pull_legs: "Жим/тяга/ноги",
  home_express: "Дома",
  strength: "Сила",
  hypertrophy: "Гипертрофия",
  mobility: "Мобильность",
  conditioning: "Кардио",
  custom: "Своя",
};

const PROGRAM_LEVEL_LABELS: Record<string, string> = {
  beginner: "Новичок",
  intermediate: "Опытный",
  advanced: "Продвинутый",
};

function scheduleOfProgram(program: Program): Array<Record<string, unknown>> {
  const raw =
    (program.structure?.schedule as unknown[]) ||
    (program.structure?.days as unknown[]) ||
    [];
  return Array.isArray(raw)
    ? raw.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    : [];
}

function dayExerciseRowsProfile(day: Record<string, unknown>): Array<{
  key: string;
  name: string;
  exerciseId?: string;
  sets?: string;
  reps?: string;
  restSec?: number;
}> {
  const exercises = Array.isArray(day.exercises) ? day.exercises : [];
  if (exercises.length) {
    return exercises.map((raw, idx) => {
      const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const name = String(
        item.exercise_name || item.name_ru || item.name || item.title || `Упражнение ${idx + 1}`,
      );
      const sets =
        item.sets != null
          ? String(item.sets)
          : item.target_sets != null
            ? String(item.target_sets)
            : undefined;
      const reps =
        item.reps != null
          ? String(item.reps)
          : item.target_reps != null
            ? String(item.target_reps)
            : undefined;
      const restRaw = item.rest_sec ?? item.rest_time_sec;
      const restSec =
        restRaw != null && Number.isFinite(Number(restRaw)) ? Number(restRaw) : undefined;
      const exerciseId =
        item.exercise_id != null
          ? String(item.exercise_id)
          : item.id != null
            ? String(item.id)
            : undefined;
      return {
        key: String(exerciseId || `${name}-${idx}`),
        name,
        sets,
        reps,
        restSec,
      };
    });
  }
  const ids = Array.isArray(day.exercise_ids) ? day.exercise_ids : [];
  return ids.map((id, idx) => ({
    key: String(id ?? idx),
    name: `Упражнение ${idx + 1}`,
  }));
}


function normalizeExerciseName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveExerciseFromCatalog(
  row: { name: string; exerciseId?: string },
  byId: Map<string, Exercise>,
  byName: Map<string, Exercise>,
): Exercise | null {
  if (row.exerciseId && byId.has(row.exerciseId)) {
    return byId.get(row.exerciseId) ?? null;
  }
  const exact = byName.get(normalizeExerciseName(row.name));
  if (exact) return exact;
  const needle = normalizeExerciseName(row.name);
  for (const [name, ex] of byName) {
    if (name.includes(needle) || needle.includes(name)) return ex;
  }
  return null;
}

function placeholderExerciseFromRow(row: {
  name: string;
  exerciseId?: string;
}): Exercise {
  return {
    id: row.exerciseId || "00000000-0000-4000-8000-000000000001",
    name_ru: row.name,
    muscle_group: "",
    equipment: null,
    description: "Карточка из программы. Полное описание появится после синхронизации каталога.",
    technique: "Выполняйте движение подконтрольно, сохраняя нейтраль корпуса.",
    common_mistakes: null,
    difficulty: 1,
    video_url: null,
    animation_url: null,
    thumbnail_url: null,
    media_duration_sec: null,
    media_source: "none",
    tags: [],
  };
}

function programMetaLine(program: Program): string {
  const st = (program.structure || {}) as Record<string, unknown>;
  const days = programDays(program);
  const lvlRaw = (program.level || program.target_level || "").toLowerCase();
  const lvl = PROGRAM_LEVEL_LABELS[lvlRaw] || program.level || program.target_level || "";
  const type = PROGRAM_TYPE_LABELS[program.workout_type] ?? program.workout_type;
  const loc = String(st.location || "");
  const locLabel = loc === "home" ? "Дом" : loc === "gym" ? "Зал" : loc === "outdoor" ? "Улица" : loc;
  return [type, lvl, locLabel, days ? `${days} дн.` : ""].filter(Boolean).join(" · ");
}


export function ProfilePage() {
  const setUser = useUserStore((s) => s.setUser);
  const storeUser = useUserStore((s) => s.user);

  // Prefer body tab if user is mid email-OTP (return from Mail app / WebView reload).
  const [tab, setTab] = useState<TabId>(() => (readOtpDraft(OTP_DRAFT_LINK_KEY) ? "body" : "body"));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);

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
  const [programSearch, setProgramSearch] = useState("");
  const [programTypeFilter, setProgramTypeFilter] = useState("");
  const [programLevelFilter, setProgramLevelFilter] = useState("");
  const [programSexFilter, setProgramSexFilter] = useState("");
  const [expandedProgramId, setExpandedProgramId] = useState<string | null>(null);
  const [programDayOpen, setProgramDayOpen] = useState<Record<string, boolean>>({});
  const [profileGoalsKeep, setProfileGoalsKeep] = useState<Record<string, unknown>>({});
  const [autoAssignedProgram, setAutoAssignedProgram] = useState(false);
  const [exerciseCatalog, setExerciseCatalog] = useState<Exercise[]>([]);
  const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);

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
  const [measWeekday, setMeasWeekday] = useState<number | null>(0);
  const [woEnabled, setWoEnabled] = useState(true);
  const [woTime, setWoTime] = useState("18:30");
  const [woDays, setWoDays] = useState<number[]>([0, 2, 4]);
  const [supEnabled, setSupEnabled] = useState(true);
  const [catchUp, setCatchUp] = useState(true);
  const [waterEnabled, setWaterEnabled] = useState(false);
  const [waterDailyMl, setWaterDailyMl] = useState("2500");
  const [waterIntervalMin, setWaterIntervalMin] = useState("120");
  const [waterStart, setWaterStart] = useState("09:00");
  const [waterEnd, setWaterEnd] = useState("21:00");
  const [calEnabled, setCalEnabled] = useState(false);
  const [calTimes, setCalTimes] = useState("14:00, 20:00");
  /** Body tab: quick essentials vs full measures / advanced energy. */
  const [bodyAdvanced, setBodyAdvanced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!getStoredToken()) {
        setLoading(false);
        setError("Нужна авторизация");
        return;
      }
      try {
        const [p, prog, sup, nset, exCatalog] = await Promise.all([
          fetchMyProfile(),
          fetchPrograms({ templatesOnly: true }).catch(() => ({ items: [] as Program[] })),
          fetchSupplementStack().catch(() => ({ items: [], catalog: [] })),
          fetchNotificationSettings().catch(() => null),
          fetchExercises({ pageSize: 200 }).catch(() => ({ items: [] as Exercise[] })),
        ]);
        if (cancelled) return;
setAuthEmail(p.auth_email ?? null);
        
        const a = asRecord(p.anthropometry);
        const g = asRecord(p.goals);
        setProfileGoalsKeep(g);
        const sexFromProfile = String(a.sex || g.sex || "male").toLowerCase();
        setSex(sexFromProfile === "female" ? "female" : "male");
        if (sexFromProfile === "male" || sexFromProfile === "female") {
          setProgramSexFilter(sexFromProfile);
        }
        setWeight(numOrEmpty(a.weight_kg));
        setHeight(numOrEmpty(a.height_cm));
        {
          const bd = String(a.birth_date || "").slice(0, 10);
          setBirthDate(bd);
          const fromBirth = ageFromBirthDate(bd);
          // Prefer live age from birth date; fall back to stored age
          setAge(fromBirth != null ? String(fromBirth) : numOrEmpty(a.age));
          // If user had birth_date but UI was in "quick" mode, surface advanced once
          if (bd) setBodyAdvanced(true);
        }
        setActivity(String(g.activity_level || a.activity_level || "moderate"));
        setPrimaryGoal(String(g.primary_goal || "maintain"));
        setAdjPct(
          numOrEmpty(
            g.calorie_adjustment_pct ??
              (g.primary_goal === "lose_fat" ? -15 : g.primary_goal === "gain_muscle" ? 10 : 0),
          ),
        );
        setDaysPerWeek(numOrEmpty(g.days_per_week || 3));
        const existingActive = String(g.active_program_id || "");
        setActiveProgramId(existingActive);
        const m = asRecord(a.measurements);
        const next: Record<string, string> = {};
        for (const f of BODY_MEASURE_FIELDS) next[f.key] = numOrEmpty(m[f.key]);
        setMeasures(next);

        const programItems = prog.items || [];
        setPrograms(programItems);
        if (exCatalog?.items?.length) {
          setExerciseCatalog(exCatalog.items);
        }

        // Auto-assign recommended program if user has none yet
        if (!existingActive && programItems.length) {
          const rec = recommendPrograms(
            programItems,
            {
              primaryGoal: String(g.primary_goal || "maintain"),
              level: String(g.level || "beginner"),
              daysPerWeek: Number(g.days_per_week) || Number(daysPerWeek) || 3,
              equipment: Array.isArray(g.equipment) ? (g.equipment as string[]) : [],
              sex: String(a.sex || g.sex || sex || ""),
              location: String(g.location || ""),
              limitations: Array.isArray(g.limitations)
                ? (g.limitations as string[])
                : (g.limitations as string | null) || null,
            },
            1,
          );
          if (rec[0]) {
            setActiveProgramId(rec[0].id);
            setAutoAssignedProgram(true);
            setExpandedProgramId(rec[0].id);
            // Persist quietly so home/recommendations use it immediately
            if (isOnline() && getStoredToken()) {
              try {
                await updateMyProfile({
                  goals: {
                    ...g,
                    active_program_id: rec[0].id,
                    recommended_program_id: rec[0].id,
                    recommended_program_at: new Date().toISOString(),
                  },
                });
                setProfileGoalsKeep((prev) => ({
                  ...prev,
                  ...g,
                  active_program_id: rec[0].id,
                  recommended_program_id: rec[0].id,
                }));
              } catch {
                // keep local selection; user can save manually
              }
            }
          }
        }

        setStack(sup.items || []);
        setCatalog(sup.catalog || []);
        setPickerKey("");

        if (nset?.settings) {
          const s = asRecord(nset.settings);
          setTz(String(s.timezone || "Europe/Moscow"));
          const meas = asRecord(s.measurements);
          setMeasEnabled(meas.enabled !== false);
          setMeasTime(String(meas.time || "10:00"));
          setMeasInterval(String(meas.interval_days ?? 14));
          const mwd = meas.weekday;
          if (mwd === null || mwd === undefined || mwd === "") setMeasWeekday(null);
          else {
            const n = Number(mwd);
            setMeasWeekday(Number.isFinite(n) ? n : 0);
          }
          const wo = asRecord(s.workouts);
          setWoEnabled(wo.enabled !== false);
          setWoTime(String(wo.time || "18:30"));
          const days = Array.isArray(wo.days) ? wo.days.map((d) => Number(d)) : [0, 2, 4];
          setWoDays(days.filter((d) => d >= 0 && d <= 6));
          const su = asRecord(s.supplements);
          setSupEnabled(su.enabled !== false);
          setCatchUp(s.catch_up !== false);
          const water = asRecord(s.water);
          setWaterEnabled(Boolean(water.enabled));
          setWaterDailyMl(String(water.daily_ml ?? 2500));
          setWaterIntervalMin(String(water.interval_minutes ?? 120));
          setWaterStart(String(water.start_time || "09:00"));
          setWaterEnd(String(water.end_time || "21:00"));
          const cal = asRecord(s.calories);
          setCalEnabled(Boolean(cal.enabled));
          const times = Array.isArray(cal.times)
            ? cal.times.map((x) => String(x)).join(", ")
            : String(cal.times || "14:00, 20:00");
          setCalTimes(times || "14:00, 20:00");
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

  const recommendedPrograms = useMemo(
    () =>
      recommendPrograms(
        programs,
        {
          primaryGoal,
          level: String(profileGoalsKeep.level || "beginner"),
          daysPerWeek: Number(daysPerWeek) || undefined,
          equipment: Array.isArray(profileGoalsKeep.equipment)
            ? (profileGoalsKeep.equipment as string[])
            : [],
          sex,
          location: String(profileGoalsKeep.location || ""),
          limitations: Array.isArray(profileGoalsKeep.limitations)
            ? (profileGoalsKeep.limitations as string[])
            : (profileGoalsKeep.limitations as string | null) || null,
        },
        3,
      ),
    [programs, primaryGoal, daysPerWeek, sex, profileGoalsKeep],
  );

  const recommendedProgram = recommendedPrograms[0] || null;
  const recommendedIds = useMemo(
    () => new Set(recommendedPrograms.map((p) => p.id)),
    [recommendedPrograms],
  );

  const programTypes = useMemo(() => {
    const set = new Set(programs.map((p) => p.workout_type).filter(Boolean));
    return Array.from(set);
  }, [programs]);

  const filteredPrograms = useMemo(() => {
    const q = programSearch.trim().toLowerCase();
    return programs.filter((p) => {
      if (q) {
        const hay = [p.name, p.description || "", p.workout_type || "", p.level || ""]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (programTypeFilter && p.workout_type !== programTypeFilter) return false;
      if (programLevelFilter) {
        const lvl = (p.level || p.target_level || "").toLowerCase();
        if (lvl !== programLevelFilter.toLowerCase()) return false;
      }
      if (programSexFilter === "male" || programSexFilter === "female") {
        const pSex = programSex(p).map((x) => x.toLowerCase());
        const isUnisex =
          pSex.length === 0 ||
          pSex.includes("any") ||
          pSex.includes("unisex") ||
          pSex.includes("all") ||
          (pSex.includes("male") && pSex.includes("female"));
        if (!isUnisex && !pSex.includes(programSexFilter)) return false;
      }
      return true;
    });
  }, [programs, programTypeFilter, programLevelFilter, programSexFilter, programSearch]);

  const exerciseById = useMemo(() => {
    const map = new Map<string, Exercise>();
    for (const ex of exerciseCatalog) map.set(ex.id, ex);
    return map;
  }, [exerciseCatalog]);

  const exerciseByName = useMemo(() => {
    const map = new Map<string, Exercise>();
    for (const ex of exerciseCatalog) map.set(normalizeExerciseName(ex.name_ru), ex);
    return map;
  }, [exerciseCatalog]);

  function openProgramExercise(row: { name: string; exerciseId?: string }) {
    const resolved = resolveExerciseFromCatalog(row, exerciseById, exerciseByName);
    setDetailExercise(resolved ?? placeholderExerciseFromRow(row));
  }

  function applyRecommendedProgram() {
    if (!recommendedProgram) return;
    setActiveProgramId(recommendedProgram.id);
    setExpandedProgramId(recommendedProgram.id);
    setAutoAssignedProgram(true);
    setOk(`Рекомендуем: ${recommendedProgram.name}`);
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
      const ageFromBirth = ageFromBirthDate(birthDate);
      const ageNum = ageFromBirth ?? (Number(age) || null);
      const anthropometry = {
        sex,
        weight_kg: Number(weight) || null,
        height_cm: Number(height) || null,
        age: ageNum,
        birth_date: birthDate || null,
        birth_year: birthYearFromDate(birthDate),
        activity_level: activity,
        measurements,
        measurements_updated_at: new Date().toISOString(),
      };
      const goals = {
        ...profileGoalsKeep,
        primary_goal: primaryGoal,
        activity_level: activity,
        calorie_adjustment_pct: Number(adjPct),
        days_per_week: Number(daysPerWeek) || 3,
        active_program_id: activeProgramId || null,
        sex,
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
          ...profileGoalsKeep,
          active_program_id: activeProgramId || null,
          days_per_week: Number(daysPerWeek) || 3,
        },
      });
      setProfileGoalsKeep((prev) => ({
        ...prev,
        active_program_id: activeProgramId || null,
        days_per_week: Number(daysPerWeek) || 3,
      }));
      setAutoAssignedProgram(false);
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

  async function setSupplementRemindersEnabled(enabled: boolean) {
    setSupEnabled(enabled);
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const current = await fetchNotificationSettings().catch(() => null);
      const base = (current?.settings as Record<string, unknown>) || {};
      const prevSup = (base.supplements as Record<string, unknown>) || {};
      const settings = {
        ...base,
        supplements: {
          ...prevSup,
          enabled,
        },
      };
      await saveNotificationSettings(settings);
      await updateMyProfile({
        goals: {
          notification_settings: settings,
        },
      });
      setOk(
        enabled
          ? "Напоминания о добавках включены"
          : "Напоминания о добавках выключены",
      );
    } catch (err) {
      setSupEnabled(!enabled);
      setError(err instanceof Error ? err.message : "Не удалось обновить напоминания");
    } finally {
      setSaving(false);
    }
  }

  async function saveAlerts() {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const calTimesList = calTimes
        .split(/[,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const settings = {
        timezone: tz,
        catch_up: catchUp,
        measurements: {
          enabled: measEnabled,
          time: measTime,
          interval_days: Number(measInterval) || 14,
          weekday: measWeekday,
        },
        workouts: {
          enabled: woEnabled,
          time: woTime,
          days: woDays,
        },
        supplements: {
          enabled: supEnabled,
        },
        water: {
          enabled: waterEnabled,
          daily_ml: Number(waterDailyMl) || 2500,
          interval_minutes: Number(waterIntervalMin) || 120,
          start_time: waterStart || "09:00",
          end_time: waterEnd || "21:00",
        },
        calories: {
          enabled: calEnabled,
          times: calTimesList.length ? calTimesList : ["14:00", "20:00"],
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
          <div className="flex rounded-full bg-tg-secondary p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setBodyAdvanced(false)}
              className={[
                "flex-1 rounded-full px-3 py-1.5 font-medium",
                !bodyAdvanced ? "bg-tg-button text-tg-button-text" : "text-tg-hint",
              ].join(" ")}
            >
              Быстрый профиль
            </button>
            <button
              type="button"
              onClick={() => setBodyAdvanced(true)}
              className={[
                "flex-1 rounded-full px-3 py-1.5 font-medium",
                bodyAdvanced ? "bg-tg-button text-tg-button-text" : "text-tg-hint",
              ].join(" ")}
            >
              Расширенные
            </button>
          </div>

          {bodyAdvanced ? (
            <LinkEmailCard
              currentEmail={authEmail}
              onLinked={(u) => {
                setAuthEmail(u.auth_email ?? null);
                setUser({
                  ...(storeUser || {
                    id: u.id,
                    subscription_status: u.subscription_status,
                    onboarding_completed: u.onboarding_completed ?? false,
                  }),
                  ...u,
                  auth_email: u.auth_email ?? null,
                });
                setOk(u.auth_email ? `Почта привязана: ${u.auth_email}` : "Почта привязана");
              }}
            />
          ) : (
            <div className="rounded-2xl bg-tg-secondary p-3 text-xs text-tg-hint">
              Пол, вес, рост, цель и дни в неделю — достаточно для калорий и программ.
              {authEmail ? (
                <span className="mt-1 block text-tg-text">Почта: {authEmail}</span>
              ) : (
                <button
                  type="button"
                  className="mt-1 block text-tg-link"
                  onClick={() => setBodyAdvanced(true)}
                >
                  Привязать email →
                </button>
              )}
            </div>
          )}

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
                Возраст
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
          </div>

          {bodyAdvanced ? (
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
          ) : null}

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
              Дней тренировок в неделю
              <input
                type="number"
                min={1}
                max={7}
                value={daysPerWeek}
                onChange={(e) => setDaysPerWeek(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
              />
            </label>
            {bodyAdvanced ? (
              <label className="block text-xs text-tg-hint">
                % к суточному расходу (минус = дефицит, плюс = профицит)
                <input
                  type="number"
                  value={adjPct}
                  onChange={(e) => setAdjPct(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
                />
              </label>
            ) : null}
          </div>

          <div className="rounded-2xl bg-tg-secondary p-4 text-sm">
            <p className="font-medium">Расчёт калорий</p>
            {preview.complete ? (
              <ul className="mt-2 space-y-2 text-tg-hint">
                <li>
                  <span className="font-medium text-tg-text">Базовый обмен (BMR): {preview.bmr} ккал</span>
                  <span className="mt-0.5 block text-xs">
                    Сколько энергии нужно телу в покое — просто чтобы жить (дыхание, сердце, температура).
                  </span>
                </li>
                <li>
                  <span className="font-medium text-tg-text">Суточный расход (TDEE): {preview.tdee} ккал</span>
                  <span className="mt-0.5 block text-xs">
                    Базовый обмен + ваша активность (тренировки, ходьба, работа). Это «поддержка веса».
                  </span>
                </li>
                <li>
                  <span className="font-medium text-tg-text">
                    Цель на день: {preview.caloriesTarget} ккал
                  </span>
                  <span className="mt-0.5 block text-xs">
                    Сколько есть, чтобы идти к цели (похудение / набор / поддержание) с учётом % к расходу.
                  </span>
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
              Фильтры помогают быстрее найти подходящую. Если программа не выбрана, система
              назначает рекомендуемую автоматически по вашему профилю.
            </p>
            {activeProgram ? (
              <p className="mt-2 text-tg-link">
                Сейчас: {activeProgram.name}
                {autoAssignedProgram ? " (авто)" : ""}
              </p>
            ) : (
              <p className="mt-2 text-tg-hint">Программа не выбрана</p>
            )}
            {recommendedProgram ? (
              <div className="mt-3 rounded-xl bg-tg-bg p-3">
                <p className="text-xs text-tg-hint">Рекомендуем сейчас</p>
                <p className="mt-1 text-sm font-medium">{recommendedProgram.name}</p>
                <p className="mt-0.5 text-xs text-tg-hint">{programMetaLine(recommendedProgram)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => applyRecommendedProgram()}
                    className="rounded-lg bg-tg-button px-3 py-1.5 text-xs font-semibold text-tg-button-text"
                  >
                    Назначить рекомендуемую
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedProgramId((id) =>
                        id === recommendedProgram.id ? null : recommendedProgram.id,
                      )
                    }
                    className="rounded-lg bg-tg-secondary px-3 py-1.5 text-xs text-tg-link"
                  >
                    {expandedProgramId === recommendedProgram.id ? "Скрыть детали" : "Детали"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <label className="block text-xs text-tg-hint">
            Поиск
            <input
              type="search"
              value={programSearch}
              onChange={(e) => setProgramSearch(e.target.value)}
              placeholder="Поиск программы"
              className="mt-1 w-full rounded-xl border border-black/10 bg-tg-bg px-3 py-2 text-sm"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "", label: "Все" },
                { id: "male", label: "Мужские" },
                { id: "female", label: "Женские" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id || "all-sex"}
                type="button"
                onClick={() => setProgramSexFilter(opt.id)}
                className={[
                  "rounded-full px-3 py-1 text-xs",
                  programSexFilter === opt.id
                    ? "bg-tg-button text-tg-button-text"
                    : "bg-tg-secondary",
                ].join(" ")}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setProgramTypeFilter("")}
              className={[
                "rounded-full px-3 py-1 text-xs",
                !programTypeFilter ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary",
              ].join(" ")}
            >
              Все типы
            </button>
            {programTypes.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setProgramTypeFilter(t)}
                className={[
                  "rounded-full px-3 py-1 text-xs",
                  programTypeFilter === t
                    ? "bg-tg-button text-tg-button-text"
                    : "bg-tg-secondary",
                ].join(" ")}
              >
                {PROGRAM_TYPE_LABELS[t] ?? t}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "", label: "Все уровни" },
                { id: "beginner", label: "Новичок" },
                { id: "intermediate", label: "Опытный" },
                { id: "advanced", label: "Продвинутый" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id || "all-lvl"}
                type="button"
                onClick={() => setProgramLevelFilter(opt.id)}
                className={[
                  "rounded-full px-3 py-1 text-xs",
                  programLevelFilter === opt.id
                    ? "bg-tg-button text-tg-button-text"
                    : "bg-tg-secondary",
                ].join(" ")}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                setActiveProgramId("");
                setAutoAssignedProgram(false);
              }}
              className={[
                "w-full rounded-xl px-4 py-3 text-left text-sm",
                !activeProgramId ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary",
              ].join(" ")}
            >
              Без фиксированной программы
            </button>

            {filteredPrograms.length === 0 ? (
              <div className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">
                Нет программ по фильтрам. Сбросьте пол / тип / уровень.
              </div>
            ) : null}

            {filteredPrograms.map((p) => {
              const selected = activeProgramId === p.id;
              const open = expandedProgramId === p.id;
              const schedule = scheduleOfProgram(p);
              const isRec = recommendedIds.has(p.id);
              return (
                <article
                  key={p.id}
                  className={[
                    "rounded-2xl p-4",
                    selected ? "bg-tg-button text-tg-button-text" : "bg-tg-secondary",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        setActiveProgramId(p.id);
                        setAutoAssignedProgram(false);
                      }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{p.name}</span>
                        {isRec ? (
                          <span
                            className={[
                              "rounded-full px-2 py-0.5 text-[10px] font-medium",
                              selected
                                ? "bg-white/20 text-tg-button-text"
                                : "bg-tg-button/15 text-tg-link",
                            ].join(" ")}
                          >
                            рекомендуем
                          </span>
                        ) : null}
                      </div>
                      <span
                        className={[
                          "mt-0.5 block text-xs",
                          selected ? "opacity-90" : "text-tg-hint",
                        ].join(" ")}
                      >
                        {programMetaLine(p)}
                      </span>
                      {p.description ? (
                        <span
                          className={[
                            "mt-1 block text-xs",
                            selected ? "opacity-90" : "text-tg-hint",
                          ].join(" ")}
                        >
                          {p.description}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className={[
                        "shrink-0 text-xs",
                        selected ? "text-tg-button-text underline" : "text-tg-link",
                      ].join(" ")}
                      onClick={() => setExpandedProgramId(open ? null : p.id)}
                    >
                      {open ? "Скрыть" : "Детали"}
                    </button>
                  </div>

                  {open ? (
                    <div
                      className={[
                        "mt-3 space-y-2 rounded-xl p-3",
                        selected ? "bg-black/10" : "bg-tg-bg",
                      ].join(" ")}
                    >
                      {schedule.length === 0 ? (
                        <p className={["text-xs", selected ? "opacity-90" : "text-tg-hint"].join(" ")}>
                          В программе пока нет дней.
                        </p>
                      ) : (
                        schedule.map((day, idx) => {
                          const dayIndex = Number(day.day_index ?? day.day ?? idx + 1) || idx + 1;
                          const name = String(day.name || day.title || `День ${dayIndex}`);
                          const rows = dayExerciseRowsProfile(day);
                          const dayKey = `${p.id}:${dayIndex}`;
                          const listOpen = Boolean(programDayOpen[dayKey]);
                          return (
                            <div
                              key={dayKey}
                              className={[
                                "rounded-lg px-3 py-2",
                                selected ? "bg-black/10" : "bg-tg-secondary",
                              ].join(" ")}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium">{name}</p>
                                  <p
                                    className={[
                                      "text-[11px]",
                                      selected ? "opacity-80" : "text-tg-hint",
                                    ].join(" ")}
                                  >
                                    {rows.length ? `${rows.length} упр.` : "упражнения по шаблону"}
                                  </p>
                                </div>
                                {rows.length > 0 ? (
                                  <button
                                    type="button"
                                    className={[
                                      "text-xs",
                                      selected ? "underline" : "text-tg-link",
                                    ].join(" ")}
                                    onClick={() =>
                                      setProgramDayOpen((prev) => ({
                                        ...prev,
                                        [dayKey]: !prev[dayKey],
                                      }))
                                    }
                                  >
                                    {listOpen ? "Скрыть список" : "Упражнения"}
                                  </button>
                                ) : null}
                              </div>
                              {listOpen && rows.length > 0 ? (
                                <ol className="mt-2 space-y-1 border-t border-black/10 pt-2">
                                  {rows.map((row, exIdx) => (
                                    <li key={row.key}>
                                      <button
                                        type="button"
                                        onClick={() => openProgramExercise(row)}
                                        className={[
                                          "flex w-full items-start justify-between gap-2 rounded-lg px-1 py-1.5 text-left text-xs",
                                          selected ? "hover:bg-white/10" : "hover:bg-black/5",
                                        ].join(" ")}
                                      >
                                        <span>
                                          <span className="font-medium">
                                            {exIdx + 1}. {row.name}
                                          </span>
                                          <span
                                            className={[
                                              "ml-1",
                                              selected ? "opacity-80" : "text-tg-hint",
                                            ].join(" ")}
                                          >
                                            {[
                                              row.sets ? `${row.sets}x` : null,
                                              row.reps || null,
                                              row.restSec != null ? `отдых ${row.restSec}с` : null,
                                            ]
                                              .filter(Boolean)
                                              .join(" · ")}
                                          </span>
                                        </span>
                                        <span
                                          className={[
                                            "shrink-0",
                                            selected ? "underline" : "text-tg-link",
                                          ].join(" ")}
                                        >
                                          Открыть
                                        </span>
                                      </button>
                                    </li>
                                  ))}
                                </ol>
                              ) : null}
                            </div>
                          );
                        })
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setActiveProgramId(p.id);
                          setAutoAssignedProgram(false);
                        }}
                        className={[
                          "mt-1 w-full rounded-lg px-3 py-2 text-xs font-semibold",
                          selected
                            ? "bg-white/20 text-tg-button-text"
                            : "bg-tg-button text-tg-button-text",
                        ].join(" ")}
                      >
                        {selected ? "Выбрана" : "Выбрать программу"}
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
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
            Открыть полный каталог программ
          </Link>
        </div>
      ) : null}

      {tab === "supplements" ? (
        <div className="space-y-3">
          <div className="rounded-2xl bg-tg-secondary p-4 text-sm">
            <p className="font-medium">Мой стек добавок</p>
            <p className="mt-1 text-xs text-tg-hint">
              По умолчанию стек пуст — добавьте сами из каталога (только добавки с доказанной
              эффективностью) или свою. У каждой — принцип действия и дозировка.
            </p>
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-tg-bg px-3 py-2">
              <div>
                <p className="text-xs font-medium">
                  Напоминания: {supEnabled ? "вкл" : "выкл"}
                </p>
                <p className="text-[11px] text-tg-hint">
                  Время приёма — ниже у каждой добавки. Глобальный рубильник — здесь.
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void setSupplementRemindersEnabled(!supEnabled)}
                className={[
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50",
                  supEnabled
                    ? "bg-tg-button text-tg-button-text"
                    : "bg-tg-secondary text-tg-hint",
                ].join(" ")}
              >
                {supEnabled ? "Вкл" : "Выкл"}
              </button>
            </div>
            <button
              type="button"
              className="mt-2 text-xs text-tg-link"
              onClick={() => {
                setTab("alerts");
                setOk(null);
              }}
            >
              Все уведомления →
            </button>
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
                          {scheduleFromEntry(item).length
                            ? ` · ${formatScheduleLabel(scheduleFromEntry(item))}`
                            : ""}
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
                        <div className="mt-2 space-y-2">
                          <p className="text-xs font-medium text-tg-text">Напоминания</p>
                          <p className="text-[11px] text-tg-hint">
                            Можно несколько времён. Для каждого — каждый день, только в день
                            тренировки или только в день без тренировки. Предустановки: до/после
                            тренировки или точное время.
                          </p>
                          {scheduleFromEntry(item).map((row, idx) => (
                            <div
                              key={`${item.id}-sch-${idx}`}
                              className="space-y-1 rounded-xl bg-tg-bg p-2"
                            >
                              <div className="grid grid-cols-1 gap-1">
                                <label className="block text-[11px] text-tg-hint">
                                  Когда
                                  <select
                                    value={
                                      SUPPLEMENT_SLOT_PRESETS.some((p) => p.id === row.slot)
                                        ? row.slot
                                        : "__custom__"
                                    }
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setStack((prev) =>
                                        prev.map((x) => {
                                          if (x.id !== item.id) return x;
                                          const sch = scheduleFromEntry(x);
                                          if (v === "__custom__") {
                                            sch[idx] = { ...sch[idx], slot: "12:00" };
                                          } else {
                                            sch[idx] = { ...sch[idx], slot: v };
                                          }
                                          return {
                                            ...x,
                                            schedule: sch,
                                            times: sch.map((s) => s.slot),
                                          };
                                        }),
                                      );
                                    }}
                                    className="mt-1 w-full rounded-lg border border-black/10 bg-tg-secondary px-2 py-1.5 text-sm"
                                  >
                                    {SUPPLEMENT_SLOT_PRESETS.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.label}
                                      </option>
                                    ))}
                                    <option value="__custom__">Своё время…</option>
                                  </select>
                                </label>
                                {!SUPPLEMENT_SLOT_PRESETS.some((p) => p.id === row.slot) ||
                                /^\d{1,2}:\d{2}$/.test(row.slot) ? (
                                  <label className="block text-[11px] text-tg-hint">
                                    Время
                                    <input
                                      type="time"
                                      value={
                                        /^\d{1,2}:\d{2}$/.test(row.slot) ? row.slot : "12:00"
                                      }
                                      onChange={(e) => {
                                        const slot = e.target.value;
                                        setStack((prev) =>
                                          prev.map((x) => {
                                            if (x.id !== item.id) return x;
                                            const sch = scheduleFromEntry(x);
                                            sch[idx] = { ...sch[idx], slot };
                                            return {
                                              ...x,
                                              schedule: sch,
                                              times: sch.map((s) => s.slot),
                                            };
                                          }),
                                        );
                                      }}
                                      className="mt-1 w-full rounded-lg border border-black/10 bg-tg-secondary px-2 py-1.5 text-sm"
                                    />
                                  </label>
                                ) : null}
                                <label className="block text-[11px] text-tg-hint">
                                  В какие дни
                                  <select
                                    value={row.days}
                                    onChange={(e) => {
                                      const days = normalizeSuppDays(e.target.value);
                                      setStack((prev) =>
                                        prev.map((x) => {
                                          if (x.id !== item.id) return x;
                                          const sch = scheduleFromEntry(x);
                                          sch[idx] = { ...sch[idx], days };
                                          return {
                                            ...x,
                                            schedule: sch,
                                            times: sch.map((s) => s.slot),
                                          };
                                        }),
                                      );
                                    }}
                                    className="mt-1 w-full rounded-lg border border-black/10 bg-tg-secondary px-2 py-1.5 text-sm"
                                  >
                                    <option value="every">Каждый день</option>
                                    <option value="workout">В день тренировки</option>
                                    <option value="rest">В день без тренировки</option>
                                  </select>
                                </label>
                              </div>
                              <button
                                type="button"
                                className="text-[11px] text-red-500"
                                onClick={() => {
                                  setStack((prev) =>
                                    prev.map((x) => {
                                      if (x.id !== item.id) return x;
                                      const sch = scheduleFromEntry(x).filter((_, i) => i !== idx);
                                      return {
                                        ...x,
                                        schedule: sch,
                                        times: sch.map((s) => s.slot),
                                      };
                                    }),
                                  );
                                }}
                              >
                                Удалить время
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            className="w-full rounded-lg bg-tg-bg px-2 py-1.5 text-xs text-tg-link"
                            onClick={() => {
                              setStack((prev) =>
                                prev.map((x) => {
                                  if (x.id !== item.id) return x;
                                  const sch = [
                                    ...scheduleFromEntry(x),
                                    { slot: "10:00", days: "every" as const },
                                  ];
                                  return {
                                    ...x,
                                    schedule: sch,
                                    times: sch.map((s) => s.slot),
                                  };
                                }),
                              );
                            }}
                          >
                            + Ещё время
                          </button>
                        </div>
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
                <>
                  <option value="">Выберите добавку…</option>
                  {unusedCatalog.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name_ru}
                    </option>
                  ))}
                </>
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
                    setPickerKey("");
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
              Напоминания приходят в чат с ботом. Один раз напишите боту /start, включите нужные
              типы ниже и нажмите «Сохранить». Если сообщение не пришло вовремя — включите
              «Догонять пропущенные».
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
                min={1}
                value={measInterval}
                onChange={(e) => setMeasInterval(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
              />
            </label>
            <div>
              <p className="text-xs text-tg-hint">День недели</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMeasWeekday(null)}
                  className={[
                    "rounded-full px-3 py-1 text-xs",
                    measWeekday === null ? "bg-tg-button text-tg-button-text" : "bg-tg-bg",
                  ].join(" ")}
                >
                  Любой
                </button>
                {WEEKDAYS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setMeasWeekday(d.id)}
                    className={[
                      "rounded-full px-3 py-1 text-xs",
                      measWeekday === d.id ? "bg-tg-button text-tg-button-text" : "bg-tg-bg",
                    ].join(" ")}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-tg-hint">
                Напоминание в выбранный день, не чаще чем раз в N дней.
              </p>
            </div>
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

          <div className="space-y-2 rounded-2xl bg-tg-secondary p-4">
            <label className="flex items-center justify-between text-sm">
              <span>Вода</span>
              <input
                type="checkbox"
                checked={waterEnabled}
                onChange={(e) => setWaterEnabled(e.target.checked)}
              />
            </label>
            <p className="text-xs text-tg-hint">
              Бот напомнит пить воду. Отмечайте воду на Главной — литраж синхронизируется с
              сервером.
            </p>
            <label className="block text-xs text-tg-hint">
              Цель, мл / день
              <input
                type="number"
                min={500}
                step={100}
                value={waterDailyMl}
                onChange={(e) => setWaterDailyMl(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-tg-hint">
              Как часто, минут
              <input
                type="number"
                min={30}
                step={15}
                value={waterIntervalMin}
                onChange={(e) => setWaterIntervalMin(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-tg-hint">
                С
                <input
                  type="time"
                  value={waterStart}
                  onChange={(e) => setWaterStart(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs text-tg-hint">
                До
                <input
                  type="time"
                  value={waterEnd}
                  onChange={(e) => setWaterEnd(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
                />
              </label>
            </div>
          </div>

          <div className="space-y-2 rounded-2xl bg-tg-secondary p-4">
            <label className="flex items-center justify-between text-sm">
              <span>Калории (недобор / перебор)</span>
              <input
                type="checkbox"
                checked={calEnabled}
                onChange={(e) => setCalEnabled(e.target.checked)}
              />
            </label>
            <p className="text-xs text-tg-hint">
              В указанное время бот пришлёт: сколько съедено, цель и недобор/перебор. Несколько
              времён — через запятую.
            </p>
            <label className="block text-xs text-tg-hint">
              Время напоминаний
              <input
                value={calTimes}
                onChange={(e) => setCalTimes(e.target.value)}
                placeholder="14:00, 20:00"
                className="mt-1 w-full rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="rounded-2xl bg-tg-secondary p-4">
            <label className="flex items-center justify-between text-sm">
              <span>Догонять пропущенные</span>
              <input
                type="checkbox"
                checked={catchUp}
                onChange={(e) => setCatchUp(e.target.checked)}
              />
            </label>
            <p className="mt-2 text-xs text-tg-hint">
              Если напоминание не успело уйти вовремя, бот пришлёт его позже в тот же день — без
              пачки дублей (для воды и калорий пришлёт одно сводное).
            </p>
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
              Расписание приёма — во вкладке «Добавки» (время и день тренировки/отдыха). Этот
              переключатель включает/выключает все напоминания по стеку.
            </p>
            {stack.length === 0 ? (
              <p className="mt-2 text-xs text-amber-700">
                Стек пуст — сначала добавьте добавки, иначе боту нечего напоминать.
              </p>
            ) : (
              <p className="mt-2 text-xs text-tg-hint">
                В стеке: {stack.length}.{" "}
                <button
                  type="button"
                  className="text-tg-link"
                  onClick={() => {
                    setTab("supplements");
                    setOk(null);
                  }}
                >
                  Настроить расписание →
                </button>
              </p>
            )}
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
            Проверить напоминания сейчас
          </button>
        </div>
      ) : null}

      <Link to="/nutrition" className="mt-4 block text-center text-xs text-tg-link">
        К дневнику питания
      </Link>
      {detailExercise ? (
        <ExerciseDetailModal
          exercise={detailExercise}
          onClose={() => setDetailExercise(null)}
        />
      ) : null}
    </section>
  );
}
