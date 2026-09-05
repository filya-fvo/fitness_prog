import { useMemo, useState } from "react";

import { resolveApiAssetUrl } from "@/api/client";
import { trackEvent } from "@/lib/analytics";
import type { Exercise } from "@/types/workout";

function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace("/", "").split("/")[0] || null;
    }
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/embed/")) {
        return u.pathname.split("/")[2] || null;
      }
      // Shorts: /shorts/<id>
      if (u.pathname.startsWith("/shorts/")) {
        return u.pathname.split("/")[2] || null;
      }
      // Live / other path forms sometimes carry ?v=
      return u.searchParams.get("v");
    }
  } catch {
    return null;
  }
  return null;
}

function resolveLocalMedia(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim();
  if (!u) return null;
  // Local public path or absolute URL (gif/webp/png/jpg/jpeg)
  if (/^https?:\/\//i.test(u) || u.startsWith("/")) {
    return resolveApiAssetUrl(u) ?? null;
  }
  return null;
}

function isLikelyStaticImage(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.(png|jpe?g|webp)(\?|#|$)/i.test(url);
}

type Props = {
  exercise: Pick<
    Exercise,
    | "id"
    | "name_ru"
    | "description"
    | "video_url"
    | "animation_url"
    | "thumbnail_url"
    | "media_source"
    | "technique"
    | "common_mistakes"
    | "muscle_group"
    | "tags"
  >;
  compact?: boolean;
  preferVideo?: boolean;
  /** Render only the GIF/image area, without technique text and video controls. */
  mediaOnly?: boolean;
  /** Short media preview for the compact active-workout layout. */
  preview?: boolean;
};

function hasGymVisualCredit(exercise: Props["exercise"]): boolean {
  const tags = exercise.tags ?? [];
  if (tags.some((t) => /gym\s*visual/i.test(t) || t === "gymvisual")) {
    return true;
  }
  const blob = `${exercise.description ?? ""} ${exercise.media_source ?? ""}`;
  return /gym\s*visual/i.test(blob);
}

export function ExerciseMediaPlayer({
  exercise,
  compact = false,
  preferVideo = false,
  mediaOnly = false,
  preview = false,
}: Props) {
  const mediaUrl = useMemo(
    () => resolveLocalMedia(exercise.animation_url),
    [exercise.animation_url],
  );
  const [mediaFailed, setMediaFailed] = useState(false);
  const [showVideo, setShowVideo] = useState(preferVideo);
  const [videoFailed, setVideoFailed] = useState(false);

  const ytId = useMemo(() => extractYouTubeId(exercise.video_url), [exercise.video_url]);
  const hasVideo = Boolean(exercise.video_url) && !videoFailed;
  const heightClass = preview ? "h-24" : compact ? "h-40" : "h-52";
  const showGymVisual = hasGymVisualCredit(exercise);

  const techniqueText =
    exercise.technique ||
    exercise.description ||
    "Описание техники пока не заполнено.";

  const showMedia = Boolean(mediaUrl) && !mediaFailed;
  const mediaIsStatic = isLikelyStaticImage(mediaUrl);

  return (
    <div className="space-y-2">
      {!showVideo ? (
        <div className="overflow-hidden rounded-xl bg-black/5">
          {showMedia ? (
            <div className="relative">
              <img
                src={mediaUrl ?? undefined}
                alt={exercise.name_ru}
                className={`w-full bg-black/10 object-contain ${heightClass}`}
                // Isolate animated GIF decode/paint from parent layout thrash.
                style={{
                  contentVisibility: "auto",
                  contain: "paint",
                  transform: "translateZ(0)",
                  willChange: "auto",
                }}
                decoding="async"
                loading="lazy"
                onError={() => setMediaFailed(true)}
                onLoad={() =>
                  trackEvent("exercise_media_played", {
                    exercise_id: exercise.id,
                    source: mediaIsStatic ? "image" : "animation",
                  })
                }
              />
              {showGymVisual ? (
                <a
                  href="https://gymvisual.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="absolute bottom-1 right-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white/90"
                >
                  © Gym Visual
                </a>
              ) : null}
            </div>
          ) : null}
          {!showMedia ? (
            exercise.thumbnail_url ? (
              <img
                src={resolveApiAssetUrl(exercise.thumbnail_url) ?? undefined}
                alt={exercise.name_ru}
                className={`w-full object-cover ${heightClass}`}
              />
            ) : (
              <div
                className={`flex items-center justify-center bg-tg-secondary text-xs text-tg-hint ${heightClass}`}
              >
                Анимация или изображение пока не добавлены
              </div>
            )
          ) : null}
          {!mediaOnly ? (
            <div className={`space-y-1 p-3 ${compact ? "text-xs" : "text-sm"}`}>
              <p className="font-medium text-tg-text">Как выполнять</p>
              <p className="whitespace-pre-wrap text-tg-hint">{techniqueText}</p>
              {exercise.common_mistakes ? (
                <p className="text-tg-hint">
                  <span className="font-medium text-tg-text">Частые ошибки: </span>
                  {exercise.common_mistakes}
                </p>
              ) : null}
              {showGymVisual ? (
                <p className="text-[11px] text-tg-hint">
                  Анимация: ©{" "}
                  <a
                    href="https://gymvisual.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Gym Visual
                  </a>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {showVideo && hasVideo ? (
        <div className="space-y-2">
          {ytId ? (
            <div className={`overflow-hidden rounded-xl bg-black ${heightClass}`}>
              <iframe
                title={`Видео: ${exercise.name_ru}`}
                src={`https://www.youtube-nocookie.com/embed/${ytId}?playsinline=1&rel=0`}
                className="h-full w-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                onLoad={() =>
                  trackEvent("exercise_media_played", {
                    exercise_id: exercise.id,
                    source: "youtube",
                  })
                }
              />
            </div>
          ) : (
            <video
              className={`w-full rounded-xl bg-black object-contain ${heightClass}`}
              src={exercise.video_url ?? undefined}
              poster={mediaUrl ?? resolveApiAssetUrl(exercise.thumbnail_url) ?? undefined}
              controls
              playsInline
              onPlay={() =>
                trackEvent("exercise_media_played", {
                  exercise_id: exercise.id,
                  source: "external",
                })
              }
              onError={() => setVideoFailed(true)}
            />
          )}
          <p className={`${compact ? "text-xs" : "text-sm"} text-tg-hint`}>{techniqueText}</p>
        </div>
      ) : null}

      {showVideo && !hasVideo ? (
        <div className="rounded-xl bg-tg-secondary p-3 text-sm text-tg-hint">
          Видео-инструкция для этого упражнения пока не добавлена.
        </div>
      ) : null}

      {!mediaOnly ? (
        <div className="flex flex-wrap gap-2">
          {hasVideo ? (
            <button
              type="button"
              onClick={() => setShowVideo((v) => !v)}
              className="rounded-full bg-tg-button px-3 py-1.5 text-xs font-semibold text-tg-button-text"
            >
              {showVideo ? "К медиа и описанию" : "Видео инструкция"}
            </button>
          ) : (
            <span className="rounded-full bg-tg-secondary px-3 py-1.5 text-xs text-tg-hint">
              Видео пока нет
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
