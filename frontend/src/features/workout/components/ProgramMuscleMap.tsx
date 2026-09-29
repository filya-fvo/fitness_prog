import { MuscleGroupIcon } from "@/features/workout/components/MuscleGroupIcon";
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
    <div className="mt-3 rounded-2xl border border-sky-300/20 bg-[#102441]/90 p-3 text-white shadow-[0_12px_28px_rgba(1,10,28,.18)]">
      <p className="text-xs font-semibold">Задействованные мышцы</p>
      <div className="mt-1 flex justify-center gap-7" aria-label="Карта мышц программы">
        <div className="flex flex-col items-center gap-1">
          <MuscleGroupIcon group="neutral" groups={front} side="front" className="h-32 w-24 text-[#ff6b46] drop-shadow-[0_0_7px_rgba(255,107,70,.55)]" />
          <span className="text-[10px] text-white/65">Спереди</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <MuscleGroupIcon group="neutral" groups={back} side="back" className="h-32 w-24 text-[#9c7bff] drop-shadow-[0_0_7px_rgba(156,123,255,.55)]" />
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
