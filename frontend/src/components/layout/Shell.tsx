/**
 * App shell: Telegram theme, auth bootstrap, routing frame.
 * Sprint 1 — TZ §7, §8, §10.
 */
import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { hasSession, loginWithTelegram } from "@/api/auth";
import { fetchMyProfile } from "@/api/users";
import { EmailLoginForm } from "@/components/EmailLoginForm";
import { OfflineBanner } from "@/components/OfflineBanner";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { ToastHost } from "@/components/ui/ToastHost";
import { startSyncListeners } from "@/db/syncQueue";
import { trackEvent } from "@/lib/analytics";
import { findResumableSession, restoreSessionIntoStore } from "@/lib/sessionRestore";
import {
  getStartParam,
  initTelegramApp,
  isTelegramEnvironment,
  pathFromStartParam,
} from "@/lib/telegram";
import { useUserStore } from "@/store/userStore";
import { isOnline } from "@/utils/network";
import { cacheUserProfile, readCachedUserProfile } from "@/utils/profileCache";
import { toUserMessage } from "@/utils/errors";

export function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthLoading = useUserStore((s) => s.isAuthLoading);
  const authError = useUserStore((s) => s.authError);
  const user = useUserStore((s) => s.user);
  const userId = user?.id;
  const setUser = useUserStore((s) => s.setUser);
  const setAuthLoading = useUserStore((s) => s.setAuthLoading);
  const setAuthError = useUserStore((s) => s.setAuthError);

  useEffect(() => {
    initTelegramApp();
    trackEvent("web_app_opened", {
      start_param: getStartParam() || null,
      online: isOnline(),
    });
    let cancelled = false;

    async function bootstrapAuth() {
      setAuthLoading(true);
      try {
        const start = getStartParam();
        if (start && !cancelled) {
          const target = pathFromStartParam(start);
          if (target && target !== location.pathname + location.search) {
            // ActiveWorkout can restore from IndexedDB or fetch a server-only session.
            navigate(target);
          }
        }

        if (!isTelegramEnvironment()) {
          // Browser outside Telegram: restore JWT or show email OTP form.
          if (hasSession() && !isOnline()) {
            const cachedUser = readCachedUserProfile();
            if (!cancelled && cachedUser) {
              setUser(cachedUser);
              setAuthLoading(false);
            } else if (!cancelled) {
              setUser(null);
              setAuthLoading(false);
            }
            return;
          }
          if (hasSession() && isOnline()) {
            try {
              const profile = await fetchMyProfile();
              if (!cancelled) {
                const restoredUser = {
                  id: profile.id,
                  telegram_id: profile.telegram_id ?? null,
                  username: profile.username ?? null,
                  auth_email: profile.auth_email ?? null,
                  subscription_status: profile.subscription_status,
                  onboarding_completed: profile.onboarding_completed,
                };
                setUser(restoredUser);
                cacheUserProfile(restoredUser);
                setAuthLoading(false);
              }
              return;
            } catch {
              // stale token — fall through to email login UI
            }
          }
          if (!cancelled) {
            setUser(null);
            setAuthLoading(false);
          }
          return;
        }

        const result = await loginWithTelegram();
        if (!cancelled) {
          setUser(result.user);
          cacheUserProfile(result.user);
          setAuthLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          const message = toUserMessage(error, "Не удалось войти в приложение");
          setAuthError(message);
        }
      }
    }

    void bootstrapAuth();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, setAuthError, setAuthLoading, setUser]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const stopSync = startSyncListeners(userId);
    if (!location.pathname.startsWith("/workouts/active/")) {
      void findResumableSession(userId).then(async (session) => {
        if (session && !cancelled) await restoreSessionIntoStore(session, userId);
      });
    }
    return () => {
      cancelled = true;
      stopSync();
    };
  }, [location.pathname, userId]);

  useEffect(() => {
    if (isAuthLoading || authError || !user) return;
    if (user.onboarding_completed) return;
    if (location.pathname.startsWith("/onboarding")) return;
    navigate("/onboarding", { replace: true });
  }, [authError, isAuthLoading, location.pathname, navigate, user]);

  useEffect(() => {
    if (isTelegramEnvironment() || !user || !hasSession()) return;
    const verifyAfterReconnect = async () => {
      if (!isOnline()) return;
      try {
        const profile = await fetchMyProfile();
        const verifiedUser = {
          id: profile.id,
          telegram_id: profile.telegram_id ?? null,
          username: profile.username ?? null,
          auth_email: profile.auth_email ?? null,
          subscription_status: profile.subscription_status,
          onboarding_completed: profile.onboarding_completed,
        };
        setUser(verifiedUser);
        cacheUserProfile(verifiedUser);
      } catch {
        // Keep the offline context; individual server actions remain unavailable.
      }
    };
    window.addEventListener("online", verifyAfterReconnect);
    return () => window.removeEventListener("online", verifyAfterReconnect);
  }, [setUser, user]);

  const isFocusedFlow =
    location.pathname.startsWith("/onboarding") ||
    location.pathname.startsWith("/workouts/active/");

  return (
    <div className="min-h-screen bg-tg-bg text-tg-text">
      <div
        className={`mx-auto min-h-screen px-4 pt-4 ${isFocusedFlow ? "max-w-lg pb-6" : "max-w-5xl pb-24"}`}
      >
        {isAuthLoading ? (
          <p className="text-sm text-tg-hint">Авторизация…</p>
        ) : null}

        {!isAuthLoading && authError ? (
          <div className="mb-4 rounded-xl bg-tg-secondary p-3 text-sm">
            <p className="font-medium">Не удалось войти</p>
            <p className="mt-1 text-tg-hint">{authError}</p>
          </div>
        ) : null}

        {!isAuthLoading && !isTelegramEnvironment() && !user ? (
          <EmailLoginForm
            onSuccess={(u) => {
              setUser(u);
              cacheUserProfile(u);
              setAuthError(null);
            }}
          />
        ) : null}

        {!isAuthLoading ? <OfflineBanner /> : null}

        <Outlet />
      </div>
      <ToastHost />
      {!isFocusedFlow ? <BottomNavigation /> : null}
    </div>
  );
}
