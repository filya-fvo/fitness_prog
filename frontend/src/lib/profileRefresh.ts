import { getStoredToken } from "@/api/client";
import type { UserProfile } from "@/api/users";
import { preserveAcceptedLegalStatus } from "@/features/legal/legalState";
import { authUserFromProfile } from "@/lib/browserSession";
import { useUserStore } from "@/store/userStore";
import { cacheUserProfile } from "@/utils/profileCache";

/** Apply only to the session that requested this profile, preserving newer receipts. */
export function applyProfileRefresh(profile: UserProfile, requestedToken: string | null): boolean {
  if (getStoredToken() !== requestedToken) return false;
  const store = useUserStore.getState();
  const user = preserveAcceptedLegalStatus(store.user, authUserFromProfile(profile));
  store.setUser(user);
  cacheUserProfile(user);
  return true;
}
