import type { AdminSystemStatusResponse } from "@/api/adminSystem";

export type AdminSystemLoadState =
  | { phase: "loading"; data: null; error: null }
  | { phase: "ready"; data: AdminSystemStatusResponse; error: null }
  | { phase: "error"; data: null; error: string };

export type AdminSystemLoadAction =
  | { type: "load" }
  | { type: "success"; data: AdminSystemStatusResponse }
  | { type: "failure"; error: string };

export const initialAdminSystemState: AdminSystemLoadState = {
  phase: "loading",
  data: null,
  error: null,
};

export function adminSystemLoadReducer(
  _state: AdminSystemLoadState,
  action: AdminSystemLoadAction,
): AdminSystemLoadState {
  if (action.type === "load") return initialAdminSystemState;
  if (action.type === "failure") {
    return { phase: "error", data: null, error: action.error };
  }
  return { phase: "ready", data: action.data, error: null };
}
