import type { AuthUser } from "@/api/auth";
import { legalStatusSchema } from "@/api/legalSchemas";

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
    const status = legalStatusSchema.safeParse(value.legal_status);
    const legalStatus = status.success && status.data.user_id === value.id ? status.data : null;
    return {
      id: value.id,
      telegram_id: value.telegram_id ?? null,
      username: value.username ?? null,
      auth_email: value.auth_email ?? null,
      subscription: value.subscription,
      subscription_status: value.subscription_status,
      onboarding_completed: Boolean(value.onboarding_completed),
      legal_status: legalStatus,
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
