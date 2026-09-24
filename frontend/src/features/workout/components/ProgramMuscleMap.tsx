import { MuscleGroupIcon } from "@/features/workout/components/MuscleGroupIcon";
import type { ProgramMuscle } from "@/utils/programMuscles";
import { enumLabel } from "@/utils/localization";

type Props = {
  muscles: ProgramMuscle[];
};

export function ProgramMuscleMap({ muscles }: Props) {
  if (!muscles.length) return null;

  return (
    <div className="mt-3 rounded-2xl bg-black/15 p-3">
      <p className="section-kicker">Фокус программы</p>
      <ul className="mt-2 flex flex-wrap gap-2" aria-label="Группы мышц программы">
        {muscles.slice(0, 5).map((muscle) => (
          <li key={muscle.group} className="flex items-center gap-1.5 rounded-xl bg-white/10 px-2 py-1.5 text-xs text-tg-text">
            <MuscleGroupIcon group={muscle.group} className="h-5 w-5 text-[var(--app-brand-middle)]" />
            <span>{enumLabel(muscle.group)}</span>
            <span className="text-tg-hint">{muscle.exerciseCount}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
