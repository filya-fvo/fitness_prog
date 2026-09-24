import { useEffect } from "react";

import { AppCard } from "@/components/ui/AppCard";
import { DailyActivityEditor } from "@/features/home/components/DailyActivityEditor";
import type { DailyActivity } from "@/features/home/hooks/useDailyActivity";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";

type Props = {
  open: boolean;
  activity: DailyActivity;
  onClose: () => void;
};

/** Accessible day editor, opened from any of the three small home cards. */
export function DailyActivityDialog({ open, activity, onClose }: Props) {
  const dialogRef = useModalAccessibility<HTMLDivElement>(open, onClose);

  useEffect(() => {
    if (!open) return;
    const webApp = window.Telegram?.WebApp;
    const backButton = webApp?.BackButton;
    backButton?.show();
    backButton?.onClick(onClose);
    return () => {
      backButton?.offClick(onClose);
      backButton?.hide();
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-black/60 p-2 sm:items-center sm:justify-center sm:p-5" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-activity-dialog-title"
        tabIndex={-1}
        className="max-h-[min(760px,calc(100dvh-1rem))] w-full max-w-lg overflow-y-auto"
      >
        <AppCard tone="hero" className="min-h-full p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="section-kicker">Дневник</p>
              <h2 id="daily-activity-dialog-title" className="text-xl font-bold">Сон, вода и шаги</h2>
            </div>
            <button type="button" onClick={onClose} data-autofocus className="tap-target app-ghost-action min-h-[44px] min-w-[44px] text-xl" aria-label="Закрыть">
              ×
            </button>
          </div>
          <DailyActivityEditor activity={activity} title="Показатели за день" showStreak={false} />
        </AppCard>
      </div>
    </div>
  );
}
