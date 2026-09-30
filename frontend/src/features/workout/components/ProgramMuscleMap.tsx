import { ProgramAnatomyFigure } from "@/features/workout/components/ProgramAnatomyFigure";
import type { ProgramMuscle } from "@/utils/programMuscles";
import { enumLabel } from "@/utils/localization";

type Props = {
  muscles: ProgramMuscle[];
};

export function ProgramMuscleMap({ muscles }: Props) {
  if (!muscles.length) return null;
  const front = muscles.filter(({ group }) => !["back", "glutes", "triceps"].includes(group)).map(({ group }) => group);
  const back = muscles.filter(({ group }) => ["back", "glutes", "triceps", "legs", "shoulders"].includes(group)).map(({ group }) => group);
  const chipTones = ["from-orange-500 to-pink-600", "from-violet-500 to-purple-700", "from-pink-500 to-fuchsia-600", "from-sky-500 to-blue-600"];

  return (
    <div className="program-muscle-map mt-3 rounded-2xl border border-sky-300/20 p-3 text-white shadow-[0_12px_28px_rgba(1,10,28,.18)]">
      <p className="text-xs font-semibold">Задействованные мышцы</p>
      <div className="mt-1 flex justify-center gap-9" aria-label="Карта мышц программы">
        <div className="flex flex-col items-center gap-1">
          <ProgramAnatomyFigure groups={front} side="front" className="h-36 w-[72px] text-[#ff6949] drop-shadow-[0_4px_10px_rgba(2,10,27,.55)]" />
          <span className="text-[10px] text-white/65">Спереди</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <ProgramAnatomyFigure groups={back} side="back" className="h-36 w-[72px] text-[#a77cff] drop-shadow-[0_4px_10px_rgba(2,10,27,.55)]" />
          <span className="text-[10px] text-white/65">Сзади</span>
        </div>
      </div>
      <ul className="mt-2 grid grid-cols-4 gap-1" aria-label="Группы мышц программы">
        {muscles.slice(0, 4).map((muscle, index) => (
          <li key={muscle.group} aria-label={`${enumLabel(muscle.group)}: ${muscle.exerciseCount} упражнений`}
            className={`min-w-0 rounded-lg bg-gradient-to-r ${chipTones[index]} px-1 py-1.5 text-center text-[10px] font-semibold text-white`}>
            <span className="block truncate">{enumLabel(muscle.group)}</span>
          </li>
        ))}
      </ul>
      {muscles.length > 4 ? <p className="mt-1 text-right text-[10px] text-white/65">И ещё {muscles.length - 4} группы</p> : null}
    </div>
  );
}
