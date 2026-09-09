import { useEffect, useState } from "react";

import { getStoredToken } from "@/api/client";
import { fetchExercisePinState, setExercisePinned } from "@/api/exercises";
import { hasPlus } from "@/features/subscription/subscriptionAccess";
import { useUserStore } from "@/store/userStore";
import { toUserMessage } from "@/utils/errors";
import { isOnline } from "@/utils/network";

type Props = {
  exerciseId: string;
  initialPinned?: boolean;
  compact?: boolean;
  onChange?: (pinned: boolean) => void;
};

export function ExercisePinButton({ exerciseId, initialPinned, compact = false, onChange }: Props) {
  const plusAccess = useUserStore((state) => hasPlus(state.user));
  const [pinned, setPinned] = useState<boolean | null>(initialPinned ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPinned(initialPinned ?? null);
    setError(null);
    if (!plusAccess || initialPinned !== undefined) return;
    if (!getStoredToken() || !isOnline()) {
      setPinned(false);
      return;
    }
    let cancelled = false;
    void fetchExercisePinState(exerciseId)
      .then((state) => { if (!cancelled) setPinned(state.isPinned); })
      .catch(() => { if (!cancelled) setPinned(false); });
    return () => { cancelled = true; };
  }, [exerciseId, initialPinned, plusAccess]);

  if (!plusAccess) return null;

  async function toggle() {
    if (busy || pinned === null) return;
    if (!getStoredToken() || !isOnline()) {
      setError("Закрепление доступно онлайн");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await setExercisePinned(exerciseId, !pinned);
      setPinned(result.isPinned);
      onChange?.(result.isPinned);
    } catch (err) {
      setError(toUserMessage(err, "Не удалось изменить закрепление"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        aria-pressed={Boolean(pinned)}
        aria-label={pinned ? "Открепить упражнение" : "Закрепить упражнение"}
        disabled={busy || pinned === null}
        onClick={() => void toggle()}
        className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-tg-bg px-3 text-xs font-semibold text-tg-link disabled:opacity-50"
      >
        <span aria-hidden="true">{pinned ? "★" : "☆"}</span>
        {compact ? null : pinned ? "Закреплено" : "Закрепить"}
      </button>
      {error ? <span role="status" className="mt-1 max-w-48 text-right text-[10px] text-amber-300">{error}</span> : null}
    </span>
  );
}
