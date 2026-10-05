import { useState } from "react";

import { MuscleGroupIcon } from "@/features/workout/components/MuscleGroupIcon";
import { ExerciseMediaPlayer } from "@/features/workout/components/ExerciseMediaPlayer";
import type { Exercise } from "@/types/workout";
import { exerciseImageUrl } from "@/utils/exerciseMedia";

type ExerciseMediaTab = "photo" | "animation" | "video";

const tabs: Array<{ id: ExerciseMediaTab; label: string }> = [
  { id: "photo", label: "Фото" }, { id: "animation", label: "Анимация" }, { id: "video", label: "Видео" },
];

export function ExerciseMediaTabs({ exercise, compact = false, showTechnique = false }: {
  exercise: Exercise;
  compact?: boolean;
  showTechnique?: boolean;
}) {
  const [tab, setTab] = useState<ExerciseMediaTab>("photo");
  const photo = exerciseImageUrl(exercise);
  return (
    <section aria-label="Материалы упражнения">
      <div className="app-card-inset mb-3 grid grid-cols-3 gap-1 p-1" role="group" aria-label="Материалы">
        {tabs.map((item) => (
          <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)}
            className={`min-h-11 rounded-lg px-2 text-xs font-semibold ${tab === item.id ? "app-gradient-action text-white" : "text-tg-hint"}`}>
            {item.label}
          </button>
        ))}
      </div>
      {tab === "photo" ? (
        photo ? <img src={photo} alt={`Фото: ${exercise.name_ru}`} className={`${compact ? "h-40" : "h-52"} w-full rounded-xl bg-black/10 object-contain`} loading="lazy" /> : (
          <div className={`app-card-inset grid ${compact ? "h-40" : "h-52"} place-items-center text-[var(--app-brand-mid)]`}>
            <MuscleGroupIcon group={exercise.muscle_group} className="h-20 w-20" />
          </div>
        )
      ) : null}
      {tab === "animation" ? exercise.animation_url ? <ExerciseMediaPlayer key={`${exercise.id}-animation`} exercise={exercise} compact={compact} mediaOnly preferAnimation />
        : <p className="app-card-inset rounded-xl p-3 text-sm text-tg-hint">Анимация для этого упражнения пока не добавлена.</p> : null}
      {tab === "video" ? <ExerciseMediaPlayer key={`${exercise.id}-video`} exercise={exercise} compact={compact} mediaOnly preferVideo /> : null}
      {showTechnique ? <div className="app-card app-card-inset mt-2 space-y-1 p-3 text-xs">
        <p className="font-medium">Как выполнять</p>
        <p className="whitespace-pre-wrap text-tg-hint">{exercise.technique || exercise.description || "Описание техники пока не заполнено."}</p>
        {exercise.common_mistakes ? <p className="text-tg-hint"><span className="font-medium text-tg-text">Частые ошибки: </span>{exercise.common_mistakes}</p> : null}
      </div> : null}
    </section>
  );
}
