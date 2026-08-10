import { create } from "zustand";

export type ToastKind = "success" | "info" | "error";

export type ToastItem = {
  id: string;
  message: string;
  kind: ToastKind;
};

type ToastState = {
  items: ToastItem[];
  show: (message: string, kind?: ToastKind, ttlMs?: number) => void;
  dismiss: (id: string) => void;
};

let seq = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  show: (message, kind = "success", ttlMs = 2600) => {
    const text = String(message || "").trim();
    if (!text) return;
    const id = `t-${Date.now()}-${++seq}`;
    set((s) => ({
      items: [...s.items.slice(-3), { id, message: text, kind }],
    }));
    window.setTimeout(() => {
      get().dismiss(id);
    }, Math.max(1200, ttlMs));
  },
  dismiss: (id) => {
    set((s) => ({ items: s.items.filter((t) => t.id !== id) }));
  },
}));

/** Imperative helper for non-React modules / event handlers. */
export function toast(message: string, kind: ToastKind = "success", ttlMs?: number): void {
  useToastStore.getState().show(message, kind, ttlMs);
}
