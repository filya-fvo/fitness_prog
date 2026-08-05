/**
 * Build short pre-workout warmup blocks for gym / home / outdoor.
 */

import type { Exercise, WorkoutPlan } from "@/types/workout";
import { inferLoadType } from "@/utils/exerciseLoadType";

export type WarmupStepKind = "cardio" | "mobility";

export type WarmupStep = {
  id: string;
  kind: WarmupStepKind;
  title: string;
  detail: string;
  /** Suggested duration seconds */
  durationSec: number;
  /** Optional catalog exercise id for cardio machine swap */
  exerciseId?: string | null;
  /** Muscle focus labels */
  focus?: string[];
  skippable: boolean;
};

export type WarmupPlan = {
  location: "gym" | "home" | "outdoor" | string;
  includeCardio: boolean;
  targetTotalSec: number;
  steps: WarmupStep[];
};

const MOBILITY_POOL: Array<{ title: string; detail: string; focus: string[]; durationSec: number }> = [
  {
    title: "Круги плечами и руками",
    detail: "20–30 с в каждую сторону, без боли, полная амплитуда.",
    focus: ["плечи", "грудь", "спина"],
    durationSec: 45,
  },
  {
    title: "Вращения кистей и локтей",
    detail: "Разминка суставов перед жимами и тягами.",
    focus: ["руки", "плечи", "грудь"],
    durationSec: 30,
  },
  {
    title: "Кошка-корова / мобилизация груди",
    detail: "8–10 медленных циклов, дышите ровно.",
    focus: ["спина", "грудь", "кор"],
    durationSec: 45,
  },
  {
    title: "Приседания без веса (медленно)",
    detail: "10–12 повторений, пятки на полу, колени по носкам.",
    focus: ["ноги", "ягодиц", "кор"],
    durationSec: 60,
  },
  {
    title: "Выпады на месте без веса",
    detail: "6–8 на сторону, лёгкая амплитуда.",
    focus: ["ноги", "ягодиц"],
    durationSec: 60,
  },
  {
    title: "Наклоны к носкам / hinge без веса",
    detail: "8–10 мягких наклонов, спина нейтральна.",
    focus: ["ноги", "спина", "ягодиц"],
    durationSec: 45,
  },
  {
    title: "Вращения таза и корпуса",
    detail: "20–30 с, готовьте кор к нагрузке.",
    focus: ["кор", "спина"],
    durationSec: 40,
  },
  {
    title: "Растяжка сгибателей бедра",
    detail: "20–30 с на сторону, без пружины.",
    focus: ["ноги", "ягодиц"],
    durationSec: 50,
  },
  {
    title: "Отведения рук с лёгкой резинкой / без веса",
    detail: "12–15 лёгких повторений, разогрев плеч.",
    focus: ["плечи", "спина"],
    durationSec: 45,
  },
  {
    title: "Планка на коленях или короткая планка",
    detail: "20–30 с, только активация кора.",
    focus: ["кор", "грудь", "плечи"],
    durationSec: 30,
  },
];

function musclesFromPlan(plan: WorkoutPlan | null | undefined, catalog: Exercise[]): string[] {
  const ids = (plan?.exercises || []).map((e) => e.exercise_id);
  const set = new Set<string>();
  for (const id of ids) {
    const ex = catalog.find((c) => c.id === id);
    if (ex?.muscle_group) set.add(ex.muscle_group.toLowerCase());
  }
  return [...set];
}

function scoreMobility(item: (typeof MOBILITY_POOL)[number], muscles: string[]): number {
  if (!muscles.length) return 1;
  let s = 0;
  for (const f of item.focus) {
    if (muscles.some((m) => m.includes(f) || f.includes(m))) s += 2;
  }
  return s;
}

export function findDefaultTreadmill(catalog: Exercise[]): Exercise | null {
  const preferred = ["Беговая дорожка", "Бег на месте", "Эллипс", "Велотренажёр", "Гребля в тренажёре"];
  for (const name of preferred) {
    const hit = catalog.find((e) => e.name_ru === name);
    if (hit) return hit;
  }
  return (
    catalog.find((e) => inferLoadType(e) === "cardio_machine") ||
    catalog.find((e) => /эллипс|велотренаж|гребл|бег/i.test(e.name_ru)) ||
    null
  );
}

export function listCardioMachineOptions(catalog: Exercise[]): Exercise[] {
  const names = new Set(["Эллипс", "Велотренажёр", "Гребля в тренажёре", "Бег на месте", "Беговая дорожка"]);
  const fromNames = catalog.filter((e) => names.has(e.name_ru));
  const fromType = catalog.filter((e) => inferLoadType(e) === "cardio_machine");
  const map = new Map<string, Exercise>();
  for (const e of [...fromNames, ...fromType]) map.set(e.id, e);
  return [...map.values()];
}

export function buildWarmupPlan(input: {
  location: string | null | undefined;
  plan?: WorkoutPlan | null;
  catalog: Exercise[];
  /** Last cardio exercise id from goals */
  lastCardioExerciseId?: string | null;
  lastCardioDurationSec?: number | null;
}): WarmupPlan {
  const loc = (input.location || "gym").toLowerCase();
  const isGym = loc === "gym" || loc === "зал";
  const includeCardio = isGym;
  const muscles = musclesFromPlan(input.plan, input.catalog);
  const steps: WarmupStep[] = [];

  if (includeCardio) {
    const machines = listCardioMachineOptions(input.catalog);
    let cardio =
      (input.lastCardioExerciseId &&
        machines.find((m) => m.id === input.lastCardioExerciseId)) ||
      findDefaultTreadmill(input.catalog) ||
      machines[0] ||
      null;
    // Prefer treadmill name if present and no last preference
    if (!input.lastCardioExerciseId) {
      const tread =
        input.catalog.find((e) => /беговая|дорож/i.test(e.name_ru)) ||
        input.catalog.find((e) => e.name_ru === "Бег на месте");
      if (tread) cardio = tread;
    }
    const duration = Math.max(
      60,
      Math.min(20 * 60, Number(input.lastCardioDurationSec) || 5 * 60),
    );
    steps.push({
      id: "cardio",
      kind: "cardio",
      title: cardio?.name_ru || "Беговая дорожка",
      detail: "Лёгкий темп, разговорный пульс. Можно сменить тренажёр и время.",
      durationSec: duration,
      exerciseId: cardio?.id ?? null,
      focus: ["кардио"],
      skippable: true,
    });
  }

  const targetMobilitySec = includeCardio ? 5 * 60 : 4 * 60; // gym ~5m mobility +5m cardio; home 3–5m
  const ranked = MOBILITY_POOL.map((item) => ({
    item,
    score: scoreMobility(item, muscles),
  })).sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, "ru"));

  let acc = 0;
  let i = 0;
  for (const row of ranked) {
    if (acc >= targetMobilitySec && steps.filter((s) => s.kind === "mobility").length >= (includeCardio ? 3 : 2)) {
      break;
    }
    if (steps.filter((s) => s.kind === "mobility").length >= 5) break;
    steps.push({
      id: `mob-${i}`,
      kind: "mobility",
      title: row.item.title,
      detail: row.item.detail,
      durationSec: row.item.durationSec,
      focus: row.item.focus,
      skippable: true,
    });
    acc += row.item.durationSec;
    i += 1;
  }

  const total = steps.reduce((s, x) => s + x.durationSec, 0);
  return {
    location: isGym ? "gym" : loc === "outdoor" || loc === "улица" ? "outdoor" : "home",
    includeCardio,
    targetTotalSec: total,
    steps,
  };
}
