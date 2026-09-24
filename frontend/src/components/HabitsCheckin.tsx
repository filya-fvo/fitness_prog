/** Dated manual daily check-in retained for existing diary links and routes. */
import { DailyActivityEditor } from "@/features/home/components/DailyActivityEditor";
import { useDailyActivity } from "@/features/home/hooks/useDailyActivity";

type Props = { date?: string };

export function HabitsCheckin({ date }: Props) {
  const activity = useDailyActivity(date);
  return (
    <div className="app-card p-4">
      <DailyActivityEditor
        activity={activity}
        id="daily-checkin"
        allowDateNavigation={date == null}
        showStreak={date == null}
      />
    </div>
  );
}
