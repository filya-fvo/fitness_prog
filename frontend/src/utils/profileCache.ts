import type { AuthUser } from "@/api/auth";

const PROFILE_CACHE_KEY = "fitness_cached_user_v1";

export function cacheUserProfile(user: AuthUser): void {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(user));
  } catch {
    // Storage can be unavailable in private WebViews.
  }
}

export function readCachedUserProfile(): AuthUser | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<AuthUser>;
    if (!value.id || !value.subscription_status) return null;
    return {
      id: value.id,
      telegram_id: value.telegram_id ?? null,
      username: value.username ?? null,
      auth_email: value.auth_email ?? null,
      subscription_status: value.subscription_status,
      onboarding_completed: Boolean(value.onboarding_completed),
    };
  } catch {
    return null;
  }
}

export function clearCachedUserProfile(): void {
  try {
    localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    // ignore
  }
}
