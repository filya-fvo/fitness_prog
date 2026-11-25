import type { Exercise } from "@/types/workout";
import { ExerciseMediaPlayer } from "./ExerciseMediaPlayer";
import { ExerciseMediaTabs } from "./ExerciseMediaTabs";
import { ExerciseProgressSection } from "./ExerciseProgressSection";
import { workoutActionStyles } from "./workoutActionStyles";

type Props = {
  exercise: Exercise;
  simpleMode: boolean;
  moreOpen: boolean;
  setMoreOpen: (open: boolean) => void;
};

export function WorkoutExerciseMedia({ exercise, simpleMode, moreOpen, setMoreOpen }: Props) {
  if (simpleMode && !moreOpen) return (
    <div className="relative overflow-hidden rounded-xl">
      <ExerciseMediaPlayer exercise={exercise} compact mediaOnly preview />
      <button type="button" onClick={() => setMoreOpen(true)} aria-label={`Развернуть медиа и технику: ${exercise.name_ru}`}
        className="tap-target-x absolute right-2 top-2 rounded-lg bg-black/65 px-3 py-2 text-xs font-medium text-white">
        Медиа и техника
      </button>
    </div>
  );

  return <>
    {simpleMode ? <button type="button" className={`${workoutActionStyles.details} w-full`}
      onClick={() => setMoreOpen(false)}>Скрыть дополнительные настройки</button> : null}
    <ExerciseMediaTabs key={exercise.id} exercise={exercise} compact showTechnique />
    <ExerciseProgressSection exerciseId={exercise.id} exerciseName={exercise.name_ru} />
  </>;
}
