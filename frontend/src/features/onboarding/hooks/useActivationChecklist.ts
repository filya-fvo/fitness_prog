import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import {
  enqueueProfileUpdate,
  flushSyncQueue,
  readQueuedProfileUpdateDraft,
} from "@/db/syncQueue";
import {
  activationChecklistEnabled,
  activationSignalsFromAnalytics,
  addActivationSignals,
  completedActivationItems,
  readActivationChecklistState,
  type ActivationChecklistState,
  type ActivationSignal,
} from "@/features/onboarding/activationChecklist";
import { getAnalyticsBuffer, trackEvent } from "@/lib/analytics";
import { toast } from "@/store/toastStore";

type Options = {
  profileGoals: Record<string, unknown>;
  setProfileGoals: Dispatch<SetStateAction<Record<string, unknown>>>;
  userId?: string;
  online: boolean;
  hasCompletedSet: boolean;
  hasCheckin: boolean;
};

function configuredWorkoutDays(goals: Record<string, unknown>): number[] {
  const notifications = goals.notification_settings;
  const settings = notifications && typeof notifications === "object"
    ? notifications as Record<string, unknown>
    : {};
  const workouts = settings.workouts && typeof settings.workouts === "object"
    ? settings.workouts as Record<string, unknown>
    : {};
  const candidate = Array.isArray(workouts.days)
    ? workouts.days
    : Array.isArray(goals.workout_days) ? goals.workout_days : [];
  return candidate
    .map(Number)
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
}

function changed(previous: ActivationChecklistState, next: ActivationChecklistState): boolean {
  return JSON.stringify(previous) !== JSON.stringify(next);
}

export function useActivationChecklist(options: Options) {
  const {
    profileGoals,
    setProfileGoals,
    userId,
    online,
    hasCompletedSet,
    hasCheckin,
  } = options;
  const [analyticsRevision, setAnalyticsRevision] = useState(0);
  const [queuedState, setQueuedState] = useState<ActivationChecklistState | null>(() =>
    userId
      ? readActivationChecklistState(
        readQueuedProfileUpdateDraft(userId)?.goals?.activation_checklist,
      )
      : null,
  );
  const profileState = useMemo(
    () => readActivationChecklistState(profileGoals.activation_checklist),
    [profileGoals.activation_checklist],
  );
  const state = activationChecklistEnabled() ? queuedState ?? profileState : null;
  const hasConfiguredSchedule = configuredWorkoutDays(profileGoals).length > 0;

  const persist = useCallback((
    next: ActivationChecklistState,
    previous: ActivationChecklistState,
  ) => {
    setQueuedState(next);
    setProfileGoals((current) => ({ ...current, activation_checklist: next }));
    const before = completedActivationItems(previous.signals);
    const after = completedActivationItems(next.signals);
    for (const item of after.filter((candidate) => !before.includes(candidate))) {
      trackEvent("activation_checklist_item_completed", { item });
    }
    if (!previous.completed_at && next.completed_at) {
      trackEvent("activation_checklist_completed", { items: after.length });
    }
    void enqueueProfileUpdate({ goals: { activation_checklist: next } })
      .then(() => online && userId
        ? flushSyncQueue(userId, { retryFailed: true })
        : undefined)
      .catch(() => toast("Не удалось сохранить прогресс знакомства", "info"));
  }, [online, setProfileGoals, userId]);

  useEffect(() => {
    setQueuedState(userId
      ? readActivationChecklistState(
        readQueuedProfileUpdateDraft(userId)?.goals?.activation_checklist,
      )
      : null);
  }, [userId]);

  const applySignals = useCallback((signals: ActivationSignal[]) => {
    if (!state) return;
    const next = addActivationSignals(state, signals);
    if (changed(state, next)) persist(next, state);
  }, [persist, state]);

  const snooze = useCallback((until: string) => {
    if (!state) return;
    persist({ ...state, snoozed_until: until }, state);
  }, [persist, state]);

  const dismiss = useCallback(() => {
    if (!state) return;
    persist({ ...state, dismissed_at: new Date().toISOString() }, state);
  }, [persist, state]);

  useEffect(() => {
    const onAnalytics = () => setAnalyticsRevision((revision) => revision + 1);
    window.addEventListener("fitness:analytics-event", onAnalytics);
    return () => window.removeEventListener("fitness:analytics-event", onAnalytics);
  }, []);

  useEffect(() => {
    if (!state) return;
    const signals = activationSignalsFromAnalytics(getAnalyticsBuffer(), state.started_at);
    if (hasConfiguredSchedule) signals.push("schedule_saved");
    if (hasCompletedSet) signals.push("set_logged");
    if (hasCheckin) signals.push("checkin_saved");
    const next = addActivationSignals(state, signals);
    if (changed(state, next)) persist(next, state);
  }, [
    analyticsRevision,
    hasConfiguredSchedule,
    hasCheckin,
    hasCompletedSet,
    persist,
    state,
  ]);

  return { state, applySignals, snooze, dismiss };
}
