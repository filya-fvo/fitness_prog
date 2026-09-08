import { create } from "zustand";

import type { AuthUser } from "@/api/auth";
import { hasPlus } from "@/features/subscription/subscriptionAccess";
import { trackEvent } from "@/lib/analytics";
import { clearCachedUserProfile } from "@/utils/profileCache";

type UserState = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  authError: string | null;
  setUser: (user: AuthUser | null) => void;
  setAuthLoading: (value: boolean) => void;
  setAuthError: (message: string | null) => void;
  reset: () => void;
};

export const useUserStore = create<UserState>((set) => ({
  user: null,
  isAuthenticated: false,
  isAuthLoading: true,
  authError: null,
  setUser: (user) =>
    set((current) => {
      if (current.user && user && hasPlus(current.user) !== hasPlus(user)) {
        trackEvent("subscription_tier_changed", {
          tier: hasPlus(user) ? "plus" : "free",
          source: "profile_refresh",
        });
      }
      return {
        user,
        isAuthenticated: Boolean(user),
        authError: null,
      };
    }),
  setAuthLoading: (isAuthLoading) => set({ isAuthLoading }),
  setAuthError: (authError) => set({ authError, isAuthLoading: false }),
  reset: () => {
    clearCachedUserProfile();
    set({
      user: null,
      isAuthenticated: false,
      isAuthLoading: false,
      authError: null,
    });
  },
}));
