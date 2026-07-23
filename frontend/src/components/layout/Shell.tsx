/**
 * App shell: Telegram theme, auth bootstrap, routing frame.
 * Sprint 1 — TZ §7, §8, §10.
 */
import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { loginWithTelegram } from "@/api/auth";
import { updateMyProfile } from "@/api/users";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { startSyncListeners } from "@/db/syncQueue";
import { trackEvent } from "@/lib/analytics";
import { findResumableSession, restoreSessionIntoStore } from "@/lib/sessionRestore";
import { getStartParam, initTelegramApp, isTelegramEnvironment } from "@/lib/telegram";
import { useUserStore } from "@/store/userStore";
import { isOnline } from "@/utils/network";

export function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthLoading = useUserStore((s) => s.isAuthLoading);
  const authError = useUserStore((s) => s.authError);
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const setAuthLoading = useUserStore((s) => s.setAuthLoading);
  const setAuthError = useUserStore((s) => s.setAuthError);

  useEffect(() => {
    initTelegramApp();
    trackEvent("web_app_opened", {
      start_param: getStartParam() || null,
      online: isOnline(),
    });
    const stopSync = startSyncListeners();

    let cancelled = false;

    async function bootstrapAuth() {
      setAuthLoading(true);
      try {
        // Restore unfinished workout into Zustand (reload-safe)
        const session = await findResumableSession();
        if (session && !cancelled) {
          await restoreSessionIntoStore(session);
        }

        // Deep link from bot reminder: t.me/bot/app?startapp=workout_<id>
        const start = getStartParam();
        if (start.startsWith("workout_") && !cancelled) {
          const id = start.slice("workout_".length);
          if (id) {
            navigate(`/workouts/active/${id}`);
          }
        }

        if (!isTelegramEnvironment()) {
          // Local browser: skip real auth, keep shell usable for UI work
          if (!cancelled) {
            setUser(null);
            setAuthLoading(false);
          }
          return;
        }
        const result = await loginWithTelegram();
        if (!cancelled) {
          setUser(result.user);
          setAuthLoading(false);

          // Flush offline onboarding draft if any
          const draftRaw = localStorage.getItem("fitness_onboarding_draft");
          if (draftRaw && isOnline()) {
            try {
              const draft = JSON.parse(draftRaw) as {
                goals?: Record<string, unknown>;
                anthropometry?: Record<string, unknown>;
              };
              const profile = await updateMyProfile(draft);
              localStorage.removeItem("fitness_onboarding_draft");
              setUser({
                ...result.user,
                onboarding_completed: profile.onboarding_completed,
              });
            } catch {
              // keep draft for next online attempt
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Auth failed";
          setAuthError(message);
        }
      }
    }

    void bootstrapAuth();
    return () => {
      cancelled = true;
      stopSync();
    };
  }, [navigate, setAuthError, setAuthLoading, setUser]);

  // Gate onboarding after auth
  useEffect(() => {
    if (isAuthLoading || authError || !user) return;
    if (user.onboarding_completed) return;
    if (location.pathname.startsWith("/onboarding")) return;
    navigate("/onboarding", { replace: true });
  }, [authError, isAuthLoading, location.pathname, navigate, user]);

  return (
    <div className="min-h-screen bg-tg-bg text-tg-text">
      <div className="mx-auto min-h-screen max-w-lg px-4 pb-24 pt-4">
        {isAuthLoading ? (
          <p className="text-sm text-tg-hint">Авторизация…</p>
        ) : null}

        {!isAuthLoading && authError ? (
          <div className="mb-4 rounded-xl bg-tg-secondary p-3 text-sm">
            <p className="font-medium">Не удалось войти</p>
            <p className="mt-1 text-tg-hint">{authError}</p>
          </div>
        ) : null}

        {!isAuthLoading && !authError && user ? (
          <p className="mb-3 text-xs text-tg-hint">
            {user.username ? `@${user.username}` : `id ${user.telegram_id}`} · {user.subscription_status}
          </p>
        ) : null}

        {!isAuthLoading && !isTelegramEnvironment() ? (
          <p className="mb-3 rounded-lg bg-tg-secondary px-3 py-2 text-xs text-tg-hint">
            Dev mode: откройте Mini App в Telegram для полной авторизации.
          </p>
        ) : null}

        <Outlet />
      </div>
      <BottomNavigation />
    </div>
  );
}
