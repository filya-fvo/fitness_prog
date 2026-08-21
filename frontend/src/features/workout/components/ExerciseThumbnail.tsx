import { useEffect, useState } from "react";

import type { Exercise } from "@/types/workout";
import { exerciseThumbnailUrl } from "@/utils/exerciseMedia";

type Props = {
  exercise: Pick<Exercise, "name_ru" | "muscle_group" | "animation_url" | "thumbnail_url">;
  size?: "sm" | "md";
};

function FallbackIcon() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="16" cy="7" r="3" />
      <path d="M16 10v8m0-5-6 4m6-4 6 4m-6 1-5 8m5-8 5 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ExerciseThumbnail({ exercise, size = "md" }: Props) {
  const url = exerciseThumbnailUrl(exercise);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [url]);

  return (
    <span
      className={[
        "exercise-thumbnail shrink-0",
        size === "sm" ? "h-10 w-10" : "h-14 w-14",
      ].join(" ")}
      aria-hidden="true"
      title={exercise.name_ru}
    >
      {url && !failed ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-contain"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <FallbackIcon />
      )}
    </span>
  );
}
