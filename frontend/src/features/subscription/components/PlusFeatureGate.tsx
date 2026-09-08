import { useEffect, type ReactNode } from "react";

import { PlusAccessSummary } from "@/features/subscription/components/PlusAccessSummary";
import { trackEvent } from "@/lib/analytics";

export function PlusFeatureGate({
  allowed,
  feature,
  children,
  title,
  compact,
}: {
  allowed: boolean;
  feature: string;
  children: ReactNode;
  title?: string;
  compact?: boolean;
}) {
  useEffect(() => {
    if (allowed) trackEvent("plus_feature_opened", { feature });
  }, [allowed, feature]);

  if (!allowed) return <PlusAccessSummary feature={feature} title={title} compact={compact} />;
  return <>{children}</>;
}
