/**
 * Current-week workout overview for Progress (Mon–Sun local).
 */
import type { Workout } from "@/types/workout";
import {
  computeWorkoutVolume,
  localDateKey,
  workoutDateKey,
} from "@/utils/progress";

export type WeekDayCell = {
  date: string;
  weekdayShort: string;
  isToday: boolean;
  completed: number;
  volume: number;
};

export type WeeklyWorkoutOverview = {
  weekStart: string;
  weekEnd: string;
  rangeLabel: string;
  days: WeekDayCell[];
  completedWorkouts: number;
  activeDays: number;
  totalVolume: number;
  totalSets: number;
  avgRpe: number | null;
  vsPrevWeek: {
    workoutsDelta: number;
    volumeDelta: number;
    prevWorkouts: number;
    prevVolume: number;
  };
  tip: string;
};

export type WeekDeltaKind = "workouts" | "volume";

export function formatWeekDelta(value: number, kind: WeekDeltaKind): string {
  if (value === 0) return "как на прошлой неделе";
  const direction = value > 0 ? "больше" : "меньше";
  const absolute = Math.abs(value);
  if (kind === "workouts") {
    const mod10 = absolute % 10;
    const mod100 = absolute % 100;
    const noun = mod10 === 1 && mod100 !== 11
      ? "тренировку"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "тренировки"
        : "тренировок";
    return `на ${absolute} ${noun} ${direction}`;
  }
  const amount = absolute >= 1000
    ? `${(absolute / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} т`
    : `${absolute.toLocaleString("ru-RU")} кг`;
  return `на ${amount} ${direction}`;
}

const WD_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
  const dow = d.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offset);
  return d;
}

function shortRu(key: string): string {
  if (key.length >= 10) return `${key.slice(8, 10)}.${key.slice(5, 7)}`;
  return key;
}

function countCompletedSets(w: Workout): number {
  return (w.sets || []).filter((s) => s.is_completed).length;
}

function avgRpe(workouts: Workout[]): number | null {
  const vals = workouts
    .map((w) => (w.rpe != null ? Number(w.rpe) : NaN))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

function inRange(key: string | null, from: string, to: string): boolean {
  return Boolean(key && key >= from && key <= to);
}

export function buildWeeklyWorkoutOverview(
  workouts: Workout[],
  today = new Date(),
): WeeklyWorkoutOverview {
  const mon = mondayOf(today);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const weekStart = localDateKey(mon);
  const weekEnd = localDateKey(sun);
  const todayKey = localDateKey(today);

  const prevMon = new Date(mon);
  prevMon.setDate(mon.getDate() - 7);
  const prevSun = new Date(mon);
  prevSun.setDate(mon.getDate() - 1);
  const prevStart = localDateKey(prevMon);
  const prevEnd = localDateKey(prevSun);

  const completed = workouts.filter((w) => w.status === "completed");

  const thisWeek = completed.filter((w) => inRange(workoutDateKey(w), weekStart, weekEnd));
  const prevWeek = completed.filter((w) => inRange(workoutDateKey(w), prevStart, prevEnd));

  const days: WeekDayCell[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    const key = localDateKey(d);
    const dayWorkouts = thisWeek.filter((w) => workoutDateKey(w) === key);
    days.push({
      date: key,
      weekdayShort: WD_SHORT[i] || "",
      isToday: key === todayKey,
      completed: dayWorkouts.length,
      volume: dayWorkouts.reduce((a, w) => a + computeWorkoutVolume(w), 0),
    });
  }

  const totalVolume = thisWeek.reduce((a, w) => a + computeWorkoutVolume(w), 0);
  const totalSets = thisWeek.reduce((a, w) => a + countCompletedSets(w), 0);
  const activeDays = days.filter((d) => d.completed > 0).length;
  const prevVolume = prevWeek.reduce((a, w) => a + computeWorkoutVolume(w), 0);

  let tip = "Закройте ещё одну тренировку на этой неделе — выполнение плана и прогресс обновятся.";
  if (thisWeek.length === 0) {
    tip = "На этой неделе ещё нет завершённых тренировок. Начните с Главной → Сегодня.";
  } else if (thisWeek.length >= 3 && totalVolume >= prevVolume) {
    tip = "Сильная неделя: объём не ниже прошлой. Следите за сном и белком.";
  } else if (thisWeek.length === 1) {
    tip = "Одна тренировка уже есть. Ещё 1–2 до конца недели — хороший ритм.";
  } else if (totalVolume < prevVolume * 0.7 && prevWeek.length > 0) {
    tip = "Объём ниже прошлой недели — нормально на лёгкой фазе или после паузы.";
  } else {
    tip = "Держите темп: 2–4 тренировки в неделю обычно достаточно для прогресса.";
  }

  return {
    weekStart,
    weekEnd,
    rangeLabel: `${shortRu(weekStart)}–${shortRu(weekEnd)}`,
    days,
    completedWorkouts: thisWeek.length,
    activeDays,
    totalVolume: Math.round(totalVolume),
    totalSets,
    avgRpe: avgRpe(thisWeek),
    vsPrevWeek: {
      workoutsDelta: thisWeek.length - prevWeek.length,
      volumeDelta: Math.round(totalVolume - prevVolume),
      prevWorkouts: prevWeek.length,
      prevVolume: Math.round(prevVolume),
    },
    tip,
  };
}
