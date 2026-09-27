import { MuscleGroupIcon } from "@/features/workout/components/MuscleGroupIcon";
import type { ProgramMuscle } from "@/utils/programMuscles";
import { enumLabel } from "@/utils/localization";

type Props = {
  muscles: ProgramMuscle[];
};

export function ProgramMuscleMap({ muscles }: Props) {
  if (!muscles.length) return null;

  return (
    <div className="app-card-inset mt-3 p-3">
      <p className="section-kicker">Фокус программы</p>
      <ul className="mt-2 flex flex-wrap gap-2" aria-label="Группы мышц программы">
        {muscles.slice(0, 5).map((muscle) => (
          <li key={muscle.group} className="app-chip flex items-center gap-1.5 px-2 py-1.5 text-xs">
            <MuscleGroupIcon group={muscle.group} className="h-8 w-6 text-[var(--app-brand-mid)]" />
            <span>{enumLabel(muscle.group)}</span>
            <span className="text-tg-hint">{muscle.exerciseCount}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
