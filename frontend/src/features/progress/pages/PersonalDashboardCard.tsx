import { DiaryModeTabs } from "@/features/progress/components/DiaryModeTabs";
import type { AnalyticsDepth } from "@/utils/personalDashboard";

type Props = {
  level: string;
  depth: AnalyticsDepth;
  saving: boolean;
  error: string | null;
  onExpandedChange: (expanded: boolean) => void;
};

export function PersonalDashboardCard({
  level,
  depth,
  saving,
  error,
  onExpandedChange,
}: Props) {
  const expanded = depth === "advanced";
  return (
    <section className="app-card app-card-neutral mb-4 p-3" aria-label="Режим дневника">
      <DiaryModeTabs expanded={expanded} saving={saving} level={level} onChange={onExpandedChange} />
      {error ? <p role="status" className="mt-2 text-xs text-amber-500">{error}</p> : null}
    </section>
  );
}
