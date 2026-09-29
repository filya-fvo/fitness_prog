import { Link } from "react-router-dom";

import type { BodyMeasurementAnalytics, BodyMeasurementPeriod } from "@/api/bodyMeasurements";
import type { DailyMetric } from "@/api/dailyMetrics";
import type { PersonalRegularity } from "@/api/workouts";
import type { DashboardGuidance } from "@/utils/personalDashboard";
import { GOAL_DASHBOARD } from "@/utils/personalDashboard";
import type { WeeklyWorkoutOverview } from "@/utils/weeklyOverview";

type Props = {
  regularity: PersonalRegularity | null;
  week: WeeklyWorkoutOverview;
  dailyMetrics: DailyMetric[];
  measurements: BodyMeasurementAnalytics | null;
  measurementMonths: BodyMeasurementPeriod;
  goal: string;
  guidance: DashboardGuidance;
};

function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours ? `${hours} ч ${rest} мин` : `${rest} мин`;
}

function recentMetrics(days: DailyMetric[]): DailyMetric[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 6);
  const key = [cutoff.getFullYear(), String(cutoff.getMonth() + 1).padStart(2, "0"), String(cutoff.getDate()).padStart(2, "0")].join("-");
  return days.filter((day) => day.date.slice(0, 10) >= key);
}

export function DiarySnapshotCards({ regularity, week, dailyMetrics, measurements, measurementMonths, goal, guidance }: Props) {
  const completion = regularity?.has_schedule && regularity.planned
    ? Math.round(Math.max(0, Math.min(100, regularity.completion_pct ?? 0)))
    : null;
  const recent = recentMetrics(dailyMetrics);
  const hasActivity = recent.some((day) => day.active_minutes != null);
  const active = recent.reduce((sum, day) => sum + (day.active_minutes ?? 0), 0);
  const sleep = recent.filter((day) => day.sleep_minutes != null).map((day) => day.sleep_minutes!);
  const averageSleep = sleep.length ? sleep.reduce((sum, value) => sum + value, 0) / sleep.length : null;
  const weight = measurements?.items.find((item) => item.field === "weight_kg");
  const measureCount = measurements?.items.filter((item) => item.latest_value != null).length ?? 0;
  const goalLabel = GOAL_DASHBOARD[goal]?.label ?? GOAL_DASHBOARD.maintain.label;

  return <div className="grid gap-2.5 md:grid-cols-2" aria-label="Показатели дневника">
    <section className="relative overflow-hidden rounded-2xl border border-sky-300/20 bg-[linear-gradient(135deg,#15355e,#102846_55%,#132047)] p-3.5 text-white shadow-[0_10px_28px_rgba(2,17,43,.22)]">
      <div className="absolute -right-8 -top-12 h-36 w-36 rounded-full bg-cyan-400/10 blur-2xl" aria-hidden="true" />
      <div className="relative flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">Выполнение плана</h2>
        <span className="text-[11px] text-sky-100/75">Последние 4 недели</span>
      </div>
      <div className="relative mt-2.5 flex items-center gap-4">
        <div className="grid h-[76px] w-[76px] shrink-0 place-items-center rounded-full p-[8px]" style={{ background: `conic-gradient(#24d4de ${completion ?? 0}%, #325277 ${completion ?? 0}% 100%)` }} role="progressbar" aria-label="Выполнение плана" aria-valuenow={completion ?? 0} aria-valuemin={0} aria-valuemax={100}>
          <div className="grid h-full w-full place-items-center rounded-full bg-[#102846] text-xl font-bold tabular-nums text-white">{completion == null ? "—" : `${completion}%`}</div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold tabular-nums">{regularity?.has_schedule ? `${regularity.completed} из ${regularity.planned}` : "Нет плана"}</p>
          <p className="text-[11px] text-sky-100/75">{regularity?.has_schedule ? "тренировок по плану" : "Выберите программу и дни"}</p>
          <div className="mt-2 flex justify-between gap-1" aria-label="Тренировки на этой неделе">
            {week.days.map((day) => <span key={day.date} className="flex flex-col items-center gap-1 text-[9px] text-sky-100/65">
              <span className={`h-2.5 w-2.5 rounded-full ${day.completed ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,.7)]" : day.isToday ? "ring-2 ring-cyan-300 bg-[#5279a5]" : "bg-[#5279a5]"}`} aria-label={`${day.weekdayShort}: ${day.completed ? `${day.completed} ${day.completed === 1 ? "тренировка" : "тренировки"}` : "без тренировки"}`} />
              {day.weekdayShort}
            </span>)}
          </div>
        </div>
      </div>
    </section>

    <section className="rounded-2xl border border-sky-300/20 bg-[linear-gradient(120deg,#15365a,#0e2846)] p-3.5 text-white shadow-[0_10px_25px_rgba(2,17,43,.18)]">
      <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-bold">Активность и восстановление</h2><span className="text-[11px] text-sky-100/70">За 7 дней</span></div>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div className="flex min-w-0 items-center gap-2 rounded-xl bg-[#0b2039]/70 p-2"><svg viewBox="0 0 32 28" className="h-7 w-8 shrink-0 fill-cyan-300" aria-hidden="true"><rect x="2" y="18" width="5" height="8" rx="1"/><rect x="10" y="12" width="5" height="14" rx="1"/><rect x="18" y="7" width="5" height="19" rx="1"/><rect x="26" y="2" width="5" height="24" rx="1"/></svg><div className="min-w-0"><p className="text-[10px] text-sky-100/70">Активность</p><p className="truncate text-sm font-bold tabular-nums">{hasActivity ? duration(active) : "Нет данных"}</p></div></div>
        <div className="flex min-w-0 items-center gap-2 rounded-xl bg-[#0b2039]/70 p-2"><svg viewBox="0 0 32 28" className="h-7 w-8 shrink-0 fill-none stroke-cyan-300" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M2 16c6-13 9 13 15 0s9-4 13-4"/></svg><div className="min-w-0"><p className="text-[10px] text-sky-100/70">Сон · среднее</p><p className="truncate text-sm font-bold tabular-nums">{averageSleep == null ? "Нет данных" : duration(averageSleep)}</p></div></div>
      </div>
    </section>

    <section className="rounded-2xl border border-sky-300/20 bg-[linear-gradient(120deg,#183459,#102642)] p-3.5 text-white shadow-[0_10px_25px_rgba(2,17,43,.18)]">
      <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-bold">Вес и замеры</h2><Link to="/measurements" className="flex min-h-11 items-center text-xs text-cyan-300">Все ›</Link></div>
      <div className="grid grid-cols-2 gap-2">
        <div className="relative min-w-0 overflow-hidden rounded-xl bg-[radial-gradient(circle_at_95%_95%,rgba(239,68,141,.22),transparent_55%),#0b2039] p-2.5"><p className="relative text-[10px] text-sky-100/70">Вес</p><p className="relative mt-1 text-lg font-bold tabular-nums">{weight?.latest_value == null ? "—" : `${String(weight.latest_value).replace(".", ",")} кг`}</p><p className="relative text-[10px] text-pink-200">{weight?.latest_value == null ? "Добавьте замер" : weight.delta == null ? "Нет сравнения" : `${weight.delta > 0 ? "+" : ""}${String(weight.delta).replace(".", ",")} кг за ${measurementMonths} мес.`}</p></div>
        <Link to="/measurements" className="flex min-h-[82px] flex-col justify-center rounded-xl bg-[#0b2039]/70 p-2.5"><svg viewBox="0 0 24 32" className="h-7 w-6 fill-none stroke-cyan-300" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="4" r="2.5"/><path d="M8 9c-2 1-3 3-3 6l2 2 2-2-1-3 1 7-1 10h3l1-8 1 8h3l-1-10 1-7-1 3 2 2 2-2c0-3-1-5-3-6z"/></svg><span className="text-[10px] text-sky-100/70">Замеры</span><span className="text-xs font-semibold text-cyan-300">{measureCount ? `${measureCount} ${measureCount === 1 ? "показатель" : measureCount < 5 ? "показателя" : "показателей"}` : "Добавить"} →</span></Link>
      </div>
    </section>

    <section className="relative overflow-hidden rounded-2xl border border-violet-300/20 bg-[linear-gradient(115deg,#1b3157,#1d244e)] p-3.5 text-white shadow-[0_10px_25px_rgba(2,17,43,.18)]">
      <span aria-hidden="true" className="absolute right-2 top-1 text-5xl text-pink-400/15">◎</span>
      <div className="relative flex items-start gap-3"><span aria-hidden="true" className="text-2xl text-[#ff795f]">◎</span><div className="min-w-0 flex-1"><p className="text-[10px] text-sky-100/70">Текущая цель</p><h2 className="text-sm font-bold">{goalLabel}</h2><p className="mt-1 text-[11px] text-sky-100/75">{guidance.dataLabel} · {guidance.comparison}</p><Link to={guidance.actionHref} className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-cyan-300">{guidance.action} →</Link></div></div>
    </section>
  </div>;
}
