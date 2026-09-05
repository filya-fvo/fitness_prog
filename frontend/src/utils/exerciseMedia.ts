import { resolveApiAssetUrl } from "@/api/client";
import type { Exercise } from "@/types/workout";

type ExerciseVisual = Pick<Exercise, "animation_url" | "thumbnail_url">;

/**
 * Prefer an explicit thumbnail. Local catalog GIFs have generated first-frame PNGs,
 * so list views stay calm and do not decode many animations at once.
 */
export function exerciseThumbnailUrl(exercise: ExerciseVisual): string | null {
  const explicit = exercise.thumbnail_url?.trim();
  if (explicit) return resolveApiAssetUrl(explicit) ?? null;

  const animation = exercise.animation_url?.trim();
  const match = animation?.match(/^\/exercise-gifs\/([^/?#]+)\.gif(?:[?#].*)?$/i);
  return match ? `/exercise-thumbnails/${match[1]}.png` : null;
}
