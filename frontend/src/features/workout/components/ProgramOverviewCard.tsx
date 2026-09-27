import type { Exercise, Program } from "@/types/workout";
import { ProgramMuscleMap } from "@/features/workout/components/ProgramMuscleMap";
import type { ProgramMismatch } from "@/utils/programCompatibility";
import { programMismatchSummary } from "@/utils/programCompatibility";
import { programDurationLabel } from "@/utils/programDuration";
import { programDays, programEquipment } from "@/utils/programRecommend";
import { programMuscles } from "@/utils/programMuscles";
import { enumLabel, programDayLabel } from "@/utils/localization";

type Props = {
  program: Program;
  exerciseById: ReadonlyMap<string, Exercise>;
  badge?: string;
  reasons: string[];
  mismatches: ProgramMismatch[];
  expanded?: boolean;
};

export function ProgramOverviewCard({ program, exerciseById, badge, reasons, mismatches, expanded = false }: Props) {
  const duration = programDurationLabel(program);
  const days = programDays(program);
  const equipment = programEquipment(program);
  const muscles = programMuscles(program, exerciseById);

  return (
    <>
      <div className="flex items-start justify-between gap-2 pr-16">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="program-card-title">{programDayLabel(program.name)}</h2>
            {badge ? <span className="app-chip app-chip-info text-[10px]">{badge}</span> : null}
          </div>
          <p className="mt-1 text-xs text-tg-hint">
            {enumLabel(program.workout_type)}
            {program.level || program.target_level ? ` · ${enumLabel(program.level || program.target_level)}` : ""}
            {days ? ` · ${days} дн./нед.` : ""}
            {duration ? ` · ${duration}` : ""}
          </p>
        </div>
      </div>
      {program.description ? <p className="program-card-description">{program.description}</p> : null}
      {muscles.length ? (
        expanded ? (
          <>
            <div className="program-focus-hero mt-3" aria-hidden="true" />
            <ProgramMuscleMap muscles={muscles} />
          </>
        ) : (
          <p className="mt-2 text-xs text-tg-hint">Мышцы: {muscles.slice(0, 4).map(({ group }) => enumLabel(group)).join(" · ")}</p>
        )
      ) : null}
      {equipment.length ? <p className="mt-2 text-[11px] text-tg-hint">Инвентарь: {equipment.map((item) => enumLabel(item)).join(" · ")}</p> : null}
      {reasons.length ? <p className="mt-2 text-[11px] text-tg-link">Почему: {reasons.join(" · ")}</p> : null}
      {mismatches.length ? (
        <p className={mismatches.some((item) => item.critical) ? "app-status app-status-danger mt-2 text-xs" : "app-status app-status-warning mt-2 text-xs"}>
          Не совпадает с анкетой: {programMismatchSummary(mismatches)}
        </p>
      ) : null}
    </>
  );
}
