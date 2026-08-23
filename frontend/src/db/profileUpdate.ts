export type ProfileUpdatePayload = {
  anthropometry?: Record<string, unknown>;
  goals?: Record<string, unknown>;
};

/** Keep every pending profile field when a newer offline update is coalesced. */
export function mergeProfileUpdates(
  previous: ProfileUpdatePayload,
  next: ProfileUpdatePayload,
): ProfileUpdatePayload {
  const anthropometry =
    previous.anthropometry || next.anthropometry
      ? { ...(previous.anthropometry || {}), ...(next.anthropometry || {}) }
      : undefined;
  const goals =
    previous.goals || next.goals
      ? { ...(previous.goals || {}), ...(next.goals || {}) }
      : undefined;

  return {
    ...(anthropometry ? { anthropometry } : {}),
    ...(goals ? { goals } : {}),
  };
}
