import type { Program } from "@/types/workout";

export type RecommendInput = {
  primaryGoal?: string | null;
  level?: string | null;
  daysPerWeek?: number | null;
  equipment?: string[] | null;
  sex?: string | null;
  location?: string | null;
  limitations?: string[] | string | null;
};

const GOAL_TYPES: Record<string, string[]> = {
  lose_fat: ["conditioning", "home_express", "full_body", "hypertrophy", "push_pull_legs"],
  gain_muscle: ["hypertrophy", "push_pull_legs", "upper_lower", "strength", "full_body"],
  maintain: ["full_body", "upper_lower", "home_express", "hypertrophy", "conditioning"],
};

function asStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((x) => String(x).toLowerCase()).filter(Boolean);
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (!s) return [];
    const codes: string[] = [];
    if (s.includes("no_knee") || s.includes("колен")) codes.push("no_knee");
    if (s.includes("no_spine") || s.includes("позвон") || s.includes("поясниц") || s.includes("спин")) {
      codes.push("no_spine");
    }
    if (codes.length) return codes;
    return s.split(/[,;|/]+/).map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function structureOf(program: Program): Record<string, unknown> {
  return (program.structure || {}) as Record<string, unknown>;
}

export function programDays(program: Program): number {
  const structure = structureOf(program);
  const fromMeta = Number(structure.days_per_week);
  if (Number.isFinite(fromMeta) && fromMeta > 0) return fromMeta;
  const schedule = (structure.schedule as unknown[]) || (structure.days as unknown[]) || [];
  return Array.isArray(schedule) ? schedule.length : 0;
}

export function levelOf(program: Program): string {
  return (program.level || program.target_level || "").toLowerCase();
}

export function programSex(program: Program): string[] {
  return asStringArray(structureOf(program).sex);
}

export function programLocation(program: Program): string {
  return String(structureOf(program).location || "").toLowerCase();
}

export function programEquipment(program: Program): string[] {
  return asStringArray(structureOf(program).equipment);
}

export function programLimitations(program: Program): string[] {
  return asStringArray(structureOf(program).limitations);
}

function normalizeLimitations(input: RecommendInput["limitations"]): string[] {
  return asStringArray(input);
}

export function recommendPrograms(programs: Program[], input: RecommendInput, limit = 6): Program[] {
  if (!programs.length) return [];

  const goal = (input.primaryGoal || "maintain").toLowerCase();
  const level = (input.level || "beginner").toLowerCase();
  const days = input.daysPerWeek ?? 3;
  const equipment = new Set((input.equipment || []).map((x) => x.toLowerCase()));
  const sex = (input.sex || "").toLowerCase();
  const location = (input.location || "").toLowerCase();
  const limits = new Set(normalizeLimitations(input.limitations));
  const preferredTypes = GOAL_TYPES[goal] || GOAL_TYPES.maintain;

  const scored = programs
    .map((program) => {
      let score = 0;
      const pLevel = levelOf(program);
      const pType = (program.workout_type || "").toLowerCase();
      const pDays = programDays(program);
      const pSex = programSex(program);
      const pLoc = programLocation(program);
      const pEq = programEquipment(program);
      const pLim = new Set(programLimitations(program));

      if (sex && pSex.length && !pSex.includes(sex) && !pSex.includes("any") && !pSex.includes("unisex")) {
        return { program, score: -10_000 };
      }
      if (location && pLoc && pLoc !== location) score -= 80;

      if (limits.has("no_knee")) {
        if (pLim.has("no_knee")) score += 120;
        else score -= 100;
      } else if (pLim.has("no_knee")) score -= 25;

      if (limits.has("no_spine")) {
        if (pLim.has("no_spine")) score += 120;
        else score -= 100;
      } else if (pLim.has("no_spine")) score -= 25;

      if (pLevel && pLevel === level) score += 45;
      else if (pLevel && level === "beginner" && pLevel === "intermediate") score += 8;
      else if (pLevel && level === "advanced" && pLevel === "intermediate") score += 12;
      else if (pLevel && level === "intermediate" && pLevel === "beginner") score += 5;
      else if (pLevel && pLevel !== level) score -= 15;

      const typeIdx = preferredTypes.indexOf(pType);
      if (typeIdx >= 0) score += 28 - typeIdx * 4;

      if (pDays > 0) {
        const diff = Math.abs(pDays - days);
        score += Math.max(0, 18 - diff * 5);
      }

      if (equipment.size && pEq.length) {
        const overlap = pEq.filter((e) => equipment.has(e)).length;
        score += overlap * 10;
        const missing = pEq.filter((e) => !equipment.has(e) && e !== "bodyweight");
        score -= missing.length * 12;
      } else if (equipment.size === 1 && equipment.has("bodyweight")) {
        if (pLoc === "home" || pLoc === "outdoor" || pType === "home_express") score += 16;
        if (pEq.includes("barbell") || pEq.includes("machines")) score -= 20;
      }

      if (location === "home" && (pLoc === "home" || pType === "home_express")) score += 35;
      if (location === "gym" && pLoc === "gym") score += 35;
      if (location === "outdoor" && pLoc === "outdoor") score += 35;
      if (program.is_template) score += 2;

      return { program, score };
    })
    .filter((x) => x.score > -5000);

  scored.sort((a, b) => b.score - a.score || a.program.name.localeCompare(b.program.name, "ru"));
  const top = scored.slice(0, Math.max(1, limit)).map((x) => x.program);
  return top.length ? top : programs.slice(0, Math.max(1, limit));
}

export function pickTodayDayIndex(program: Program, now = new Date()): number {
  const days = Math.max(1, programDays(program));
  const weekday = (now.getDay() + 6) % 7;
  return (weekday % days) + 1;
}

export const LOCATION_LABELS: Record<string, string> = {
  home: "Дом",
  gym: "Зал",
  outdoor: "Улица",
};

export const LIMITATION_LABELS: Record<string, string> = {
  no_knee: "Без нагрузки на колени",
  no_spine: "Без нагрузки на позвоночник",
};

export const LEVEL_LABELS: Record<string, string> = {
  beginner: "Новичок",
  intermediate: "Опытный",
  advanced: "Продвинутый",
};
