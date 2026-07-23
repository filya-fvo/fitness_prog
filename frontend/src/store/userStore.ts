import { create } from "zustand";

import type { AuthUser } from "@/api/auth";

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
    set({
      user,
      isAuthenticated: Boolean(user),
      authError: null,
    }),
  setAuthLoading: (isAuthLoading) => set({ isAuthLoading }),
  setAuthError: (authError) => set({ authError, isAuthLoading: false }),
  reset: () =>
    set({
      user: null,
      isAuthenticated: false,
      isAuthLoading: false,
      authError: null,
    }),
}));
