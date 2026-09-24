import { useEffect, useState } from "react";

import { resolveApiAssetUrl } from "@/api/client";
import { MuscleGroupIcon } from "@/features/workout/components/MuscleGroupIcon";
import type { Exercise } from "@/types/workout";
import { exerciseThumbnailUrl } from "@/utils/exerciseMedia";
import { resolveExercisePreview } from "@/utils/exerciseMediaPresentation";

type Props = {
  exercise: Pick<Exercise, "muscle_group" | "animation_url" | "thumbnail_url">;
  size?: "sm" | "md" | "cover";
};

export function ExerciseThumbnail({ exercise, size = "md" }: Props) {
  const preferredUrl = exerciseThumbnailUrl(exercise);
  const preview = resolveExercisePreview(exercise);
  const url = preferredUrl ?? (preview.kind === "anatomy" ? null : resolveApiAssetUrl(preview.src));
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [url]);

  return (
    <span
      className={[
        "exercise-thumbnail shrink-0",
        size === "sm" ? "h-10 w-10" : size === "cover" ? "h-36 w-full rounded-none border-0" : "h-14 w-14",
      ].join(" ")}
      aria-hidden="true"
    >
      {url && !failed ? (
        <img
          src={url}
          alt=""
          className={size === "cover" ? "h-full w-full object-cover" : "h-full w-full object-cover"}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <MuscleGroupIcon group={exercise.muscle_group} className={size === "cover" ? "h-20 w-20" : "h-7 w-7"} />
      )}
    </span>
  );
}
