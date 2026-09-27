import { useState } from "react";

import { MuscleGroupIcon } from "@/features/workout/components/MuscleGroupIcon";
import { ExerciseMediaPlayer } from "@/features/workout/components/ExerciseMediaPlayer";
import type { Exercise } from "@/types/workout";
import { exerciseThumbnailUrl } from "@/utils/exerciseMedia";

type ExerciseMediaTab = "photo" | "animation" | "video";

const tabs: Array<{ id: ExerciseMediaTab; label: string }> = [
  { id: "photo", label: "Фото" }, { id: "animation", label: "Анимация" }, { id: "video", label: "Видео" },
];

export function ExerciseMediaTabs({ exercise }: { exercise: Exercise }) {
  const [tab, setTab] = useState<ExerciseMediaTab>("photo");
  const photo = exerciseThumbnailUrl(exercise);
  return (
    <section aria-label="Материалы упражнения">
      <div className="app-card-inset mb-3 grid grid-cols-3 gap-1 p-1" role="tablist" aria-label="Материалы">
        {tabs.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}
            className={`min-h-11 rounded-lg px-2 text-xs font-semibold ${tab === item.id ? "app-gradient-action text-white" : "text-tg-hint"}`}>
            {item.label}
          </button>
        ))}
      </div>
      {tab === "photo" ? (
        photo ? <img src={photo} alt={`Фото: ${exercise.name_ru}`} className="h-52 w-full rounded-xl bg-black/10 object-cover" loading="lazy" /> : (
          <div className="app-card-inset grid h-52 place-items-center text-[var(--app-brand-mid)]">
            <MuscleGroupIcon group={exercise.muscle_group} className="h-20 w-20" />
          </div>
        )
      ) : null}
      {tab === "animation" ? <ExerciseMediaPlayer exercise={exercise} mediaOnly /> : null}
      {tab === "video" ? <ExerciseMediaPlayer exercise={exercise} mediaOnly preferVideo /> : null}
    </section>
  );
}
