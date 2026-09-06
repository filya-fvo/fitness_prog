import type { PersonalRegularity } from "@/api/workouts";

type Props = {
  summary: PersonalRegularity | null;
  valueSize?: "large" | "medium";
};

export function PlanRegularityCard({ summary, valueSize = "medium" }: Props) {
  const valueClass = valueSize === "large" ? "text-2xl" : "text-xl";
  const details = summary
    ? [
        summary.rescheduled_completed ? `перенесено и выполнено: ${summary.rescheduled_completed}` : "",
        summary.cancelled ? `отменено: ${summary.cancelled}` : "",
        summary.missed ? `пропущено: ${summary.missed}` : "",
      ].filter(Boolean).join(" · ")
    : "";

  return (
    <div className="rounded-2xl bg-tg-secondary p-4">
      <p className="text-xs text-tg-hint">Выполнение плана · 4 недели</p>
      {!summary ? (
        <>
          <p className={`mt-1 font-semibold ${valueClass}`}>—</p>
          <p className="mt-1 text-[11px] text-tg-hint">Расчёт доступен после синхронизации</p>
        </>
      ) : !summary.has_schedule ? (
        <>
          <p className={`mt-1 font-semibold ${valueClass}`}>Нет активного плана</p>
          <p className="mt-1 text-[11px] text-tg-hint">Выберите программу и тренировочные дни</p>
        </>
      ) : summary.planned === 0 ? (
        <>
          <p className={`mt-1 font-semibold ${valueClass}`}>Пока нет данных</p>
          <p className="mt-1 text-[11px] text-tg-hint">Сегодняшний план учитывается после выполнения или завершения дня</p>
        </>
      ) : (
        <>
          <p className={`mt-1 font-semibold ${valueClass}`}>
            {summary.completed} из {summary.planned} · {summary.completion_pct ?? 0}%
          </p>
          <p className="mt-1 text-[11px] text-tg-hint">
            {details || "Все учтённые тренировки выполнены"}
          </p>
        </>
      )}
    </div>
  );
}
