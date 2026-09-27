import { MuscleGroupIcon } from "@/features/workout/components/MuscleGroupIcon";
import type { ProgramMuscle } from "@/utils/programMuscles";
import { enumLabel } from "@/utils/localization";

type Props = {
  muscles: ProgramMuscle[];
};

export function ProgramMuscleMap({ muscles }: Props) {
  if (!muscles.length) return null;
  const front = muscles.filter(({ group }) => !["back", "glutes", "triceps"].includes(group)).map(({ group }) => group);
  const back = muscles.filter(({ group }) => ["back", "glutes", "triceps"].includes(group)).map(({ group }) => group);

  return (
    <div className="app-card-inset mt-3 p-3">
      <p className="section-kicker">Задействованные мышцы</p>
      <div className="mt-2 flex justify-center gap-8" aria-label="Карта мышц программы">
        <div className="flex flex-col items-center gap-1">
          <MuscleGroupIcon group="neutral" groups={front} side="front" className="h-28 w-20 text-[var(--app-brand-mid)]" />
          <span className="text-[10px] text-tg-hint">Спереди</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <MuscleGroupIcon group="neutral" groups={back} side="back" className="h-28 w-20 text-[var(--app-brand-mid)]" />
          <span className="text-[10px] text-tg-hint">Сзади</span>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Группы мышц программы">
        {muscles.slice(0, 5).map((muscle) => (
          <li key={muscle.group} className="app-chip flex items-center gap-1.5 px-2 py-1.5 text-xs">
            <span>{enumLabel(muscle.group)}</span>
            <span className="text-tg-hint">{muscle.exerciseCount}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
