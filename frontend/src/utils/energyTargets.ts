/**
 * Client-side Mifflin–St Jeor helpers (mirrors backend energy_targets).
 * Used for live preview in onboarding/profile before save.
 */

export type EnergyInput = {
  sex?: string | null;
  weightKg?: number | null;
  heightCm?: number | null;
  age?: number | null;
  birthDate?: string | null;
  activityLevel?: string | null;
  daysPerWeek?: number | null;
  primaryGoal?: string | null;
  calorieAdjustmentPct?: number | null;
};

const ACTIVITY: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const GOAL_PCT: Record<string, number> = {
  lose_fat: -15,
  gain_muscle: 10,
  maintain: 0,
};

/**
 * Parse YYYY-MM-DD (or ISO datetime) as a local calendar date.
 * Avoid `new Date("1990-05-01")` which is UTC midnight and can shift the day
 * (and thus age/year) in timezones east of UTC.
 */
export function parseLocalDateInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return dt;
  }
  const fallback = new Date(raw);
  if (Number.isNaN(fallback.getTime())) return null;
  return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
}

export function ageFromBirthDate(birthDate: string | null | undefined, today = new Date()): number | null {
  const d = parseLocalDateInput(birthDate);
  if (!d) return null;
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  if (age < 10 || age > 100) return null;
  return age;
}

/** Birth year from YYYY-MM-DD (local parse). */
export function birthYearFromDate(birthDate: string | null | undefined): number | null {
  const d = parseLocalDateInput(birthDate);
  if (!d) return null;
  const y = d.getFullYear();
  return y >= 1900 && y <= 2100 ? y : null;
}

export function resolveAge(input: EnergyInput): number | null {
  const fromBirth = ageFromBirthDate(input.birthDate);
  if (fromBirth != null) return fromBirth;
  const age = Number(input.age);
  if (Number.isFinite(age) && age >= 10 && age <= 100) return age;
  return null;
}

export function resolveAdjustmentPct(input: EnergyInput): number {
  if (input.calorieAdjustmentPct != null && Number.isFinite(Number(input.calorieAdjustmentPct))) {
    return Math.max(-40, Math.min(40, Number(input.calorieAdjustmentPct)));
  }
  return GOAL_PCT[input.primaryGoal || "maintain"] ?? 0;
}

export function resolveActivity(input: EnergyInput): string {
  const level = (input.activityLevel || "").toLowerCase();
  if (level && ACTIVITY[level]) return level;
  const days = Number(input.daysPerWeek) || 3;
  if (days <= 2) return "light";
  if (days <= 4) return "moderate";
  if (days <= 5) return "active";
  return "very_active";
}

/** Normalize sex labels (en/ru) for Mifflin–St Jeor and calorie floor. */
export function isFemaleSex(sex?: string | null): boolean {
  const s = String(sex || "")
    .trim()
    .toLowerCase()
    .replaceAll("ё", "е");
  if (!s) return false;
  if (["f", "female", "woman", "w", "ж", "жен", "женский", "female_sex"].includes(s)) {
    return true;
  }
  if (s.startsWith("fem")) return true;
  if (s === "f") return true;
  if (s.startsWith("ж")) return true;
  return false;
}

/**
 * Live BMR/TDEE/target preview (mirrors backend).
 *
 * Mifflin–St Jeor (1990):
 *   Men:   10·W + 6.25·H − 5·A + 5
 *   Women: 10·W + 6.25·H − 5·A − 161
 * TDEE = BMR × activity factor (Harris–Benedict style multipliers).
 * Target = TDEE × (1 + adjustment%/100), floored at 1200♀ / 1500♂ kcal.
 */
export function previewEnergyTargets(input: EnergyInput) {
  const weight = Number(input.weightKg);
  const height = Number(input.heightCm);
  const age = resolveAge(input);
  if (!(weight > 0) || !(height > 0) || age == null) {
    return { complete: false as const, reason: "incomplete" as const };
  }
  const female = isFemaleSex(input.sex);
  const bmr = female
    ? 10 * weight + 6.25 * height - 5 * age - 161
    : 10 * weight + 6.25 * height - 5 * age + 5;
  const activity = resolveActivity(input);
  const tdee = bmr * ACTIVITY[activity];
  const adj = resolveAdjustmentPct(input);
  let target = tdee * (1 + adj / 100);
  target = Math.max(female ? 1200 : 1500, target);
  const proteinPerKg = input.primaryGoal === "lose_fat" ? 2 : input.primaryGoal === "gain_muscle" ? 1.8 : 1.6;
  const proteins = Math.max(80, proteinPerKg * weight);
  const fatRatio = input.primaryGoal === "gain_muscle" ? 0.25 : 0.3;
  const fats = Math.max(40, (target * fatRatio) / 9);
  const carbs = Math.max(0, (target - proteins * 4 - fats * 9) / 4);
  return {
    complete: true as const,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    caloriesTarget: Math.round(target),
    adjustmentPct: adj,
    activity,
    macros: {
      proteins: Math.round(proteins),
      fats: Math.round(fats),
      carbs: Math.round(carbs),
    },
  };
}

export const BODY_MEASURE_FIELDS = [
  { key: "weight_kg", label: "Вес, кг", unit: "кг", min: 20, max: 500 },
  { key: "neck_cm", label: "Шея, см", unit: "см", min: 1, max: 500 },
  { key: "shoulders_cm", label: "Плечи, см", unit: "см", min: 1, max: 500 },
  { key: "chest_cm", label: "Грудь, см", unit: "см", min: 1, max: 500 },
  { key: "waist_cm", label: "Талия, см", unit: "см", min: 1, max: 500 },
  { key: "hips_cm", label: "Бёдра, см", unit: "см", min: 1, max: 500 },
  { key: "bicep_cm", label: "Бицепс, см", unit: "см", min: 1, max: 500 },
  { key: "thigh_cm", label: "Бедро, см", unit: "см", min: 1, max: 500 },
  { key: "calf_cm", label: "Голень, см", unit: "см", min: 1, max: 500 },
] as const;

export const ACTIVITY_OPTIONS = [
  { id: "sedentary", label: "Сидячий" },
  { id: "light", label: "Лёгкая активность" },
  { id: "moderate", label: "Умеренная" },
  { id: "active", label: "Высокая" },
  { id: "very_active", label: "Очень высокая" },
] as const;
