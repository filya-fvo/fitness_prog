import type { ReactNode } from "react";
import { AppButton } from "@/components/ui/AppButton";

export function NotificationSection({
  title,
  summary,
  enabled,
  children,
}: {
  title: string;
  summary: string;
  enabled: boolean;
  children: ReactNode;
}) {
  return (
    <details className="app-card group">
      <summary className="flex min-h-[68px] cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${enabled ? "bg-emerald-500" : "bg-tg-hint/40"}`}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="mt-0.5 block truncate text-xs text-tg-hint">{summary}</span>
        </span>
        <span className="text-lg text-tg-hint transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
      </summary>
      <div className="border-t border-black/10 p-4 dark:border-white/10">{children}</div>
    </details>
  );
}

export function SaveSectionButton({
  busy,
  onClick,
}: {
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <AppButton
      disabled={busy}
      onClick={onClick}
      className="mt-4 w-full"
    >
      {busy ? "Сохраняем…" : "Сохранить раздел"}
    </AppButton>
  );
}
