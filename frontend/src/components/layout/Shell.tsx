/**
 * App shell: Telegram theme, auth bootstrap, routing frame.
 * Sprint 1 — TZ §7, §8, §10.
 */
import { lazy, Suspense, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { hasSession, loginWithTelegram, type AuthUser } from "@/api/auth";
import { clearStoredToken } from "@/api/client";
import { fetchMyProfile } from "@/api/users";
import { EmailLoginForm } from "@/components/EmailLoginForm";
import { TelegramBrowserLogin } from "@/components/TelegramBrowserLogin";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { ToastHost } from "@/components/ui/ToastHost";
import { useTelegramExitGesture } from "@/hooks/useTelegramExitGesture";
import { trackEvent } from "@/lib/analytics";
import { authUserFromProfile, isUnauthorizedBrowserSession } from "@/lib/browserSession";
import {
  getStartParam,
  initTelegramApp,
  isTelegramEnvironment,
  pathFromStartParam,
} from "@/lib/telegram";
import { useUserStore } from "@/store/userStore";
import { isOnline } from "@/utils/network";
import {
  cacheUserProfile,
  clearCachedUserProfile,
  readCachedUserProfile,
} from "@/utils/profileCache";
import { toUserMessage } from "@/utils/errors";

const OfflineBanner = lazy(() =>
  import("@/components/OfflineBanner").then((module) => ({ default: module.OfflineBanner })),
);

export function Shell() {
  useTelegramExitGesture();
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
    let bootstrapInFlight = false;
    let retryAfterFailure = false;
    let retryQueued = false;

    async function bootstrapAuth() {
      if (bootstrapInFlight || cancelled) return;
      bootstrapInFlight = true;
      setAuthLoading(true);
      setAuthError(null);
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
          if (!hasSession()) {
            if (!cancelled) {
              setUser(null);
              setAuthLoading(false);
            }
            return;
          }

          const cachedUser = readCachedUserProfile();
          if (cachedUser && !cancelled) {
            // Render the previous verified session immediately. The server refresh
            // below updates it without blocking browser/PWA startup.
            setUser(cachedUser);
            setAuthLoading(false);
          }
          if (!isOnline()) {
            if (!cachedUser && !cancelled) {
              setUser(null);
              setAuthLoading(false);
            }
            return;
          }

          try {
            const profile = await fetchMyProfile(8_000);
            if (!cancelled) {
              const restoredUser = authUserFromProfile(profile);
              setUser(restoredUser);
              cacheUserProfile(restoredUser);
              setAuthLoading(false);
            }
          } catch (error) {
            if (isUnauthorizedBrowserSession(error)) {
              clearStoredToken();
              clearCachedUserProfile();
              if (!cancelled) {
                setUser(null);
                setAuthLoading(false);
              }
            } else if (!cachedUser) {
              throw error;
            }
          }
          return;
        }

        const result = await loginWithTelegram();
        if (!cancelled) {
          retryAfterFailure = false;
          retryQueued = false;
          setUser(result.user);
          cacheUserProfile(result.user);
          setAuthLoading(false);
        }
      } catch (error) {
        retryAfterFailure = true;
        if (!cancelled) {
          const message = toUserMessage(error, "Не удалось войти в приложение");
          setAuthError(message);
          setAuthLoading(false);
        }
      } finally {
        bootstrapInFlight = false;
        if (retryQueued && retryAfterFailure && isOnline() && !cancelled) {
          retryQueued = false;
          queueMicrotask(() => void bootstrapAuth());
        }
      }
    }

    void bootstrapAuth();
    const retryBootstrap = () => {
      if (!retryAfterFailure || !isOnline()) return;
      if (bootstrapInFlight) {
        retryQueued = true;
        return;
      }
      retryQueued = false;
      void bootstrapAuth();
    };
    const retryWhenVisible = () => {
      if (document.visibilityState === "visible") retryBootstrap();
    };
    // A Funnel outage does not change navigator.onLine on the phone, so an
    // "online" event alone cannot recover a failed Telegram authorization.
    window.addEventListener("online", retryBootstrap);
    document.addEventListener("visibilitychange", retryWhenVisible);
    const retryTimer = window.setInterval(retryBootstrap, 10_000);
    return () => {
      cancelled = true;
      window.removeEventListener("online", retryBootstrap);
      document.removeEventListener("visibilitychange", retryWhenVisible);
      window.clearInterval(retryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, setAuthError, setAuthLoading, setUser]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let stopSync: (() => void) | null = null;
    void Promise.all([
      import("@/db/syncQueue"),
      import("@/lib/sessionRestore"),
    ]).then(async ([syncQueue, sessionRestore]) => {
      if (cancelled) return;
      stopSync = syncQueue.startSyncListeners(userId);
      if (!location.pathname.startsWith("/workouts/active/")) {
        const session = await sessionRestore.findResumableSession(userId);
        if (session && !cancelled) {
          await sessionRestore.restoreSessionIntoStore(session, userId);
        }
      }
    });
    return () => {
      cancelled = true;
      stopSync?.();
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
        const profile = await fetchMyProfile(8_000);
        const verifiedUser = authUserFromProfile(profile);
        setUser(verifiedUser);
        cacheUserProfile(verifiedUser);
      } catch (error) {
        if (isUnauthorizedBrowserSession(error)) {
          clearStoredToken();
          clearCachedUserProfile();
          setUser(null);
        }
        // Temporary failures keep the cached context; server actions remain unavailable.
      }
    };
    window.addEventListener("online", verifyAfterReconnect);
    return () => window.removeEventListener("online", verifyAfterReconnect);
  }, [setUser, user]);

  const isFocusedFlow =
    location.pathname.startsWith("/onboarding") ||
    location.pathname.startsWith("/workouts/active/");

  const completeBrowserLogin = (authenticatedUser: AuthUser) => {
    setUser(authenticatedUser);
    cacheUserProfile(authenticatedUser);
    setAuthError(null);
  };

  return (
    <div className="app-shell min-h-screen bg-transparent text-tg-text">
      <div
        className={`mx-auto min-h-screen px-4 pt-[calc(1rem+env(safe-area-inset-top))] ${isFocusedFlow ? "max-w-lg pb-[calc(1.5rem+env(safe-area-inset-bottom))]" : "max-w-5xl pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-8 lg:pt-24"}`}
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
          <>
            <TelegramBrowserLogin onSuccess={completeBrowserLogin} />
            <EmailLoginForm onSuccess={completeBrowserLogin} />
          </>
        ) : null}

        {!isAuthLoading && user ? (
          <Suspense fallback={null}>
            <OfflineBanner />
          </Suspense>
        ) : null}

        {!isAuthLoading && (user || import.meta.env.DEV) ? <Outlet /> : null}
      </div>
      <ToastHost />
      {!isFocusedFlow ? <BottomNavigation /> : null}
    </div>
  );
}
