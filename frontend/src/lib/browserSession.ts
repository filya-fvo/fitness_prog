import type { AuthUser } from "@/api/auth";
import type { UserProfile } from "@/api/users";

export function authUserFromProfile(profile: UserProfile): AuthUser {
  return {
    id: profile.id,
    telegram_id: profile.telegram_id ?? null,
    username: profile.username ?? null,
    auth_email: profile.auth_email ?? null,
    subscription_status: profile.subscription_status,
    onboarding_completed: profile.onboarding_completed,
  };
}

export function isUnauthorizedBrowserSession(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 401 || status === 403;
}
