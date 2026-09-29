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
    <section className="mb-3 rounded-2xl border border-sky-300/20 bg-[#102846] px-3 py-2.5 text-white" aria-label="Режим дневника">
      <DiaryModeTabs expanded={expanded} saving={saving} level={level} onChange={onExpandedChange} />
      {error ? <p role="status" className="mt-2 text-xs text-amber-500">{error}</p> : null}
    </section>
  );
}
