import { useMemo, useState } from "react";

import { trackEvent } from "@/lib/analytics";
import type { Exercise } from "@/types/workout";

function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace("/", "") || null;
    }
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/embed/")) {
        return u.pathname.split("/")[2] || null;
      }
      return u.searchParams.get("v");
    }
  } catch {
    return null;
  }
  return null;
}

type Props = {
  exercise: Pick<
    Exercise,
    "id" | "name_ru" | "video_url" | "animation_url" | "thumbnail_url" | "media_source" | "technique"
  >;
  compact?: boolean;
};

export function ExerciseMediaPlayer({ exercise, compact = false }: Props) {
  const [failed, setFailed] = useState(false);
  const ytId = useMemo(() => extractYouTubeId(exercise.video_url), [exercise.video_url]);
  const source = exercise.media_source || (ytId ? "youtube" : exercise.video_url ? "external" : "none");
  const heightClass = compact ? "h-40" : "h-52";

  if (failed || source === "none" || (!exercise.video_url && !exercise.animation_url)) {
    return (
      <div className={`rounded-xl bg-black/5 p-3 ${compact ? "text-xs" : "text-sm"} text-tg-hint`}>
        {exercise.thumbnail_url ? (
          <img
            src={exercise.thumbnail_url}
            alt={exercise.name_ru}
            className={`mb-2 w-full rounded-lg object-cover ${heightClass}`}
          />
        ) : null}
        <p className="font-medium text-tg-text">Техника</p>
        <p className="mt-1">{exercise.technique || "Видео пока недоступно — ориентируйтесь на описание техники."}</p>
      </div>
    );
  }

  if (source === "youtube" && ytId) {
    return (
      <div className={`overflow-hidden rounded-xl bg-black ${heightClass}`}>
        <iframe
          title={`Видео: ${exercise.name_ru}`}
          src={`https://www.youtube-nocookie.com/embed/${ytId}?playsinline=1&rel=0`}
          className="h-full w-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          onLoad={() => trackEvent("exercise_media_played", { exercise_id: exercise.id, source: "youtube" })}
        />
      </div>
    );
  }

  if (exercise.animation_url && !exercise.video_url) {
    return (
      <img
        src={exercise.animation_url}
        alt={exercise.name_ru}
        className={`w-full rounded-xl object-cover ${heightClass}`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <video
      className={`w-full rounded-xl bg-black object-contain ${heightClass}`}
      src={exercise.video_url ?? undefined}
      poster={exercise.thumbnail_url ?? undefined}
      controls
      playsInline
      muted
      loop
      onPlay={() => trackEvent("exercise_media_played", { exercise_id: exercise.id, source: "external" })}
      onError={() => setFailed(true)}
    />
  );
}
